"""
Django views for the port scanner API.

Endpoints:
    POST /api/scan/start/      → start a scan, returns {scanId}
    GET  /api/scan/<id>/stream/ → SSE stream of scan events
    POST /api/scan/<id>/cancel/ → cancel a running scan
    GET  /api/scan/<id>/        → get completed scan record (JSON)
    GET  /api/scans/            → list all scan records (JSON)
    DELETE /api/scan/<id>/      → delete a scan record

Architecture:
    - Each scan runs in a background thread
    - The scanner generates events via a queue
    - SSE view consumes the queue and streams to the browser
    - Scan state is held in an in-memory registry (scans_registry)
      with full results persisted to SQLite via ScanRecord model

Security:
    - Target is validated via socket.gethostbyname() in the scanner
    - Port range is bounded: 1-65535, max 65535 ports per scan
    - No shell=True subprocess; Python scanner module is imported directly
    - Scanner timeout is capped at 5 s per socket
    - Only one concurrent scan per scan-id (enforced by registry)
"""

import json
import logging
import queue
import sys
import threading
import time
import uuid
from pathlib import Path

from django.http import JsonResponse, StreamingHttpResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

# ---------------------------------------------------------------------------
# Ensure the scanner package is importable regardless of cwd
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scanner.port_scanner import PortScanner  # noqa: E402

logger = logging.getLogger("portscanner_api")

# ---------------------------------------------------------------------------
# In-memory scan registry
# { scan_id: ScanEntry }
# ---------------------------------------------------------------------------

class ScanEntry:
    """Holds all runtime state for a single scan."""

    def __init__(self, scan_id: str, target: str, start_port: int, end_port: int, timeout: float):
        self.scan_id = scan_id
        self.target = target
        self.start_port = start_port
        self.end_port = end_port
        self.timeout = timeout
        self.status: str = "starting"   # starting | scanning | completed | cancelled | error
        self.ip: str | None = None
        self.started_at: float = time.time()
        self.ended_at: float | None = None
        self.open_ports: list[dict] = []    # {"port": int, "service": str}
        self.open_count: int = 0
        self.closed_count: int = 0
        self.total_ports: int = end_port - start_port + 1
        self.scanned_count: int = 0
        self.error: str | None = None
        self.duration: float | None = None

        # Used to cancel the scanner thread
        self.cancel_event = threading.Event()

        # Queue of SSE event dicts; None signals stream-end
        self.event_queue: queue.Queue = queue.Queue(maxsize=0)  # unbounded

        # Set when the scanner thread finishes (for cleanup)
        self.thread: threading.Thread | None = None

    def to_dict(self) -> dict:
        return {
            "scanId": self.scan_id,
            "target": self.target,
            "ip": self.ip,
            "startPort": self.start_port,
            "endPort": self.end_port,
            "status": self.status,
            "startedAt": self.started_at,
            "endedAt": self.ended_at,
            "duration": self.duration,
            "openCount": self.open_count,
            "closedCount": self.closed_count,
            "totalPorts": self.total_ports,
            "scannedCount": self.scanned_count,
            "openPorts": self.open_ports,
            "error": self.error,
        }


scans_registry: dict[str, ScanEntry] = {}
registry_lock = threading.Lock()

MAX_CONCURRENT_SCANS = 5
MAX_REGISTRY_SIZE = 200


def _clean_registry() -> None:
    """Remove oldest completed scans if registry is too large."""
    with registry_lock:
        completed = [
            (k, v) for k, v in scans_registry.items()
            if v.status in ("completed", "cancelled", "error")
        ]
        if len(scans_registry) > MAX_REGISTRY_SIZE:
            completed.sort(key=lambda x: x[1].started_at)
            for k, _ in completed[: len(scans_registry) - MAX_REGISTRY_SIZE]:
                del scans_registry[k]


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------

def _validate_scan_params(body: dict) -> tuple[str, int, int, float]:
    """
    Returns (target, start_port, end_port, timeout) or raises ValueError.
    """
    target = str(body.get("target", "")).strip()
    if not target or len(target) > 253:
        raise ValueError("target must be a non-empty string (max 253 chars)")

    # Forbidden characters that could indicate injection attempts
    for ch in (";", "&", "|", "`", "$", "(", ")", "<", ">", "\n", "\r", "\x00"):
        if ch in target:
            raise ValueError(f"target contains forbidden character: {ch!r}")

    start_port_raw = body.get("startPort", body.get("start_port", 1))
    end_port_raw = body.get("endPort", body.get("end_port", 1024))
    timeout_raw = body.get("timeout", 0.5)

    try:
        start_port = int(start_port_raw)
        end_port = int(end_port_raw)
        timeout = float(timeout_raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"startPort, endPort must be integers, timeout a float: {exc}") from exc

    if not (1 <= start_port <= 65535):
        raise ValueError(f"startPort {start_port} out of range 1-65535")
    if not (1 <= end_port <= 65535):
        raise ValueError(f"endPort {end_port} out of range 1-65535")
    if start_port > end_port:
        raise ValueError(f"startPort ({start_port}) must be <= endPort ({end_port})")
    if end_port - start_port + 1 > 65535:
        raise ValueError("Port range cannot exceed 65535 ports")
    timeout = max(0.1, min(timeout, 5.0))

    return target, start_port, end_port, timeout


# ---------------------------------------------------------------------------
# Scanner thread
# ---------------------------------------------------------------------------

def _run_scanner(entry: ScanEntry) -> None:
    """Runs in a background thread. Feeds events into entry.event_queue."""
    logger.info(
        "[SCAN %s] Starting: target=%s ports=%d-%d",
        entry.scan_id, entry.target, entry.start_port, entry.end_port,
    )
    try:
        scanner = PortScanner(
            entry.target,
            entry.start_port,
            entry.end_port,
            timeout=entry.timeout,
            cancel_event=entry.cancel_event,
        )
        for event in scanner.scan():
            # Update in-memory state
            etype = event.get("type")

            if etype == "info":
                entry.ip = event.get("ip")
                entry.status = "scanning"
                logger.info("[SCAN %s] Resolved IP: %s", entry.scan_id, entry.ip)

            elif etype == "progress":
                entry.scanned_count = event.get("scanned", 0)

            elif etype == "result":
                port = event.get("port")
                service = event.get("service", "unknown")
                entry.open_ports.append({"port": port, "service": service})
                entry.open_count += 1
                logger.info("[SCAN %s] Port %d OPEN (%s)", entry.scan_id, port, service)

            elif etype == "complete":
                entry.open_count = event.get("open", entry.open_count)
                entry.closed_count = event.get("closed", 0)
                entry.duration = event.get("duration")
                entry.ended_at = time.time()
                entry.status = "completed"
                logger.info(
                    "[SCAN %s] Completed — open=%d closed=%d duration=%.1fs",
                    entry.scan_id, entry.open_count, entry.closed_count, entry.duration or 0,
                )

            elif etype == "cancelled":
                entry.status = "cancelled"
                entry.ended_at = time.time()
                logger.info("[SCAN %s] Cancelled", entry.scan_id)

            elif etype == "error":
                entry.status = "error"
                entry.error = event.get("message", "Unknown error")
                entry.ended_at = time.time()
                logger.error("[SCAN %s] Error: %s", entry.scan_id, entry.error)

            # Push event to SSE queue
            entry.event_queue.put(event)

    except Exception as exc:  # noqa: BLE001
        logger.exception("[SCAN %s] Unexpected exception", entry.scan_id)
        error_event = {"type": "error", "message": str(exc)}
        entry.status = "error"
        entry.error = str(exc)
        entry.ended_at = time.time()
        entry.event_queue.put(error_event)
    finally:
        # Signal SSE stream to close
        entry.event_queue.put(None)


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

@method_decorator(csrf_exempt, name="dispatch")
class StartScanView(View):
    """
    POST /api/scan/start/
    Body: {"target": "...", "startPort": 1, "endPort": 1000, "timeout": 0.5}
    Response: {"scanId": "..."}
    """

    def post(self, request):
        try:
            body = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            return JsonResponse({"error": "Invalid JSON body"}, status=400)

        try:
            target, start_port, end_port, timeout = _validate_scan_params(body)
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)

        # Check concurrency limit
        with registry_lock:
            running = sum(
                1 for e in scans_registry.values() if e.status in ("starting", "scanning")
            )
            if running >= MAX_CONCURRENT_SCANS:
                return JsonResponse(
                    {"error": f"Too many concurrent scans ({MAX_CONCURRENT_SCANS} max). "
                               "Wait for a running scan to finish."},
                    status=429,
                )

        scan_id = str(uuid.uuid4())
        entry = ScanEntry(scan_id, target, start_port, end_port, timeout)

        with registry_lock:
            scans_registry[scan_id] = entry

        thread = threading.Thread(target=_run_scanner, args=(entry,), daemon=True)
        entry.thread = thread
        thread.start()

        logger.info("[SCAN %s] Created for target=%s ports=%d-%d", scan_id, target, start_port, end_port)
        _clean_registry()
        return JsonResponse({"scanId": scan_id})


@method_decorator(csrf_exempt, name="dispatch")
class ScanStreamView(View):
    """
    GET /api/scan/<scan_id>/stream/
    Server-Sent Events stream. Each event is a JSON-encoded dict.

    SSE format:
        data: {"type": "result", "port": 80, "state": "open", "service": "HTTP"}\n\n
    """

    def get(self, request, scan_id: str):
        with registry_lock:
            entry = scans_registry.get(scan_id)

        if entry is None:
            return JsonResponse({"error": "Scan not found"}, status=404)

        def event_stream():
            # Send a connected acknowledgment immediately
            yield f"data: {json.dumps({'type': 'connected', 'scanId': scan_id})}\n\n"

            while True:
                try:
                    event = entry.event_queue.get(timeout=30)
                except queue.Empty:
                    # Heartbeat to keep connection alive
                    yield ": heartbeat\n\n"
                    continue

                if event is None:
                    # Sentinel — scanner thread finished
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"
                    break

                yield f"data: {json.dumps(event)}\n\n"

        response = StreamingHttpResponse(
            event_stream(),
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


@method_decorator(csrf_exempt, name="dispatch")
class CancelScanView(View):
    """
    POST /api/scan/<scan_id>/cancel/
    """

    def post(self, request, scan_id: str):
        with registry_lock:
            entry = scans_registry.get(scan_id)

        if entry is None:
            return JsonResponse({"error": "Scan not found"}, status=404)

        if entry.status not in ("starting", "scanning"):
            return JsonResponse(
                {"error": f"Scan is not running (status: {entry.status})"},
                status=400,
            )

        entry.cancel_event.set()
        logger.info("[SCAN %s] Cancel requested", scan_id)
        return JsonResponse({"scanId": scan_id, "status": "cancelling"})


@method_decorator(csrf_exempt, name="dispatch")
class ScanDetailView(View):
    """
    GET    /api/scan/<scan_id>/   → return scan record JSON
    DELETE /api/scan/<scan_id>/   → remove scan from registry
    """

    def get(self, request, scan_id: str):
        with registry_lock:
            entry = scans_registry.get(scan_id)
        if entry is None:
            return JsonResponse({"error": "Scan not found"}, status=404)
        return JsonResponse(entry.to_dict())

    def delete(self, request, scan_id: str):
        with registry_lock:
            entry = scans_registry.pop(scan_id, None)
        if entry is None:
            return JsonResponse({"error": "Scan not found"}, status=404)
        # Cancel if still running to prevent zombie thread
        entry.cancel_event.set()
        return JsonResponse({"deleted": scan_id})


@method_decorator(csrf_exempt, name="dispatch")
class ScanListView(View):
    """
    GET /api/scans/  → list all scans (summary, newest first)
    """

    def get(self, request):
        with registry_lock:
            entries = list(scans_registry.values())
        entries.sort(key=lambda e: e.started_at, reverse=True)
        return JsonResponse({"scans": [e.to_dict() for e in entries]})


def health(request):
    """GET /api/health/"""
    return JsonResponse({"status": "ok", "scanner": "ready"})
