"""
Port scanner module – enhanced from the original user-provided script.

Original logic preserved:
    socket.socket(AF_INET, SOCK_STREAM) with connect_ex() and 0.5 s timeout

Additions for web integration:
    - JSON-line streaming output (type: progress | result | complete | error)
    - Threading for concurrent port probing (max 100 threads)
    - Graceful cancellation via threading.Event
    - Service name lookup table
    - IPv4 / hostname validation
    - Proper exception handling

Usage (module):
    from scanner.port_scanner import PortScanner
    scanner = PortScanner(target, start_port, end_port, timeout=0.5)
    for event in scanner.scan():
        print(json.dumps(event))

Usage (subprocess stdin):
    python port_scanner.py <target> <start_port> <end_port> [timeout] [--cancel-on-stdin]
"""

import socket
import sys
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterator

# ---------------------------------------------------------------------------
# Common service names (ports 1-1024 + common high ports)
# ---------------------------------------------------------------------------
SERVICES: dict[int, str] = {
    20: "FTP-data", 21: "FTP", 22: "SSH", 23: "Telnet",
    25: "SMTP", 53: "DNS", 67: "DHCP", 68: "DHCP",
    69: "TFTP", 80: "HTTP", 110: "POP3", 119: "NNTP",
    123: "NTP", 143: "IMAP", 161: "SNMP", 194: "IRC",
    443: "HTTPS", 445: "SMB", 465: "SMTPS", 587: "SMTP",
    636: "LDAPS", 993: "IMAPS", 995: "POP3S",
    1080: "SOCKS", 1433: "MSSQL", 1521: "Oracle",
    3306: "MySQL", 3389: "RDP", 5432: "PostgreSQL",
    5900: "VNC", 6379: "Redis", 6443: "Kubernetes",
    8080: "HTTP-Alt", 8443: "HTTPS-Alt", 8888: "Jupyter",
    9200: "Elasticsearch", 27017: "MongoDB",
}

MAX_CONCURRENT = 100   # max simultaneous socket connections
MAX_TOTAL_PORTS = 65535


def validate_target(target: str) -> str:
    """Resolve hostname / validate IP. Returns resolved IP string."""
    try:
        ip = socket.gethostbyname(target.strip())
        return ip
    except socket.gaierror as exc:
        raise ValueError(f"Cannot resolve target '{target}': {exc}") from exc


class PortScanner:
    """Thread-safe, cancellable TCP port scanner."""

    def __init__(
        self,
        target: str,
        start_port: int,
        end_port: int,
        timeout: float = 0.5,
        cancel_event: threading.Event | None = None,
    ) -> None:
        if start_port < 1 or end_port > 65535 or start_port > end_port:
            raise ValueError(
                f"Invalid port range {start_port}-{end_port}. "
                "Ports must be 1-65535 and start <= end."
            )
        self.target = target.strip()
        self.start_port = start_port
        self.end_port = end_port
        self.timeout = float(timeout)
        self.cancel_event = cancel_event or threading.Event()
        self._ip: str | None = None

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def scan(self) -> Iterator[dict]:
        """
        Generator — yields JSON-serialisable dicts:
            {"type": "info",     "ip": str, "target": str}
            {"type": "progress", "scanned": int, "total": int}
            {"type": "result",   "port": int, "state": str, "service": str}
            {"type": "complete", "open": int, "closed": int, "total": int, "duration": float}
            {"type": "error",    "message": str}
            {"type": "cancelled"}
        Only open ports emit a "result" event. Closed ports are counted silently.
        """
        started = time.time()
        try:
            self._ip = validate_target(self.target)
        except ValueError as exc:
            yield {"type": "error", "message": str(exc)}
            return

        yield {"type": "info", "ip": self._ip, "target": self.target}

        ports = range(self.start_port, self.end_port + 1)
        total = len(ports)
        open_count = 0
        closed_count = 0
        scanned = 0
        last_progress = -1

        # Emit initial progress
        yield {"type": "progress", "scanned": 0, "total": total}

        # Build port batches for thread pool
        with ThreadPoolExecutor(max_workers=min(MAX_CONCURRENT, total)) as pool:
            futures = {
                pool.submit(self._probe, port): port
                for port in ports
            }

            for future in as_completed(futures):
                if self.cancel_event.is_set():
                    # Cancel remaining futures
                    for f in futures:
                        f.cancel()
                    yield {"type": "cancelled"}
                    return

                port = futures[future]
                try:
                    is_open = future.result()
                except Exception:
                    is_open = False

                scanned += 1
                pct = int(scanned / total * 100)

                if is_open:
                    open_count += 1
                    yield {
                        "type": "result",
                        "port": port,
                        "state": "open",
                        "service": SERVICES.get(port, "unknown"),
                    }
                else:
                    closed_count += 1

                # Emit progress every 1% change (or every port for small ranges)
                if pct != last_progress or total <= 100:
                    last_progress = pct
                    yield {"type": "progress", "scanned": scanned, "total": total}

        duration = round(time.time() - started, 3)
        yield {
            "type": "complete",
            "open": open_count,
            "closed": closed_count,
            "total": total,
            "duration": duration,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _probe(self, port: int) -> bool:
        """
        Original scanning logic from the user-provided script.
        Returns True if port is open, False otherwise.
        """
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(self.timeout)
                return s.connect_ex((self._ip, port)) == 0
        except Exception:
            return False


# ---------------------------------------------------------------------------
# CLI entry point (used when spawned as subprocess)
# ---------------------------------------------------------------------------

def _cli() -> None:
    """
    Subprocess-friendly CLI.
    Writes one JSON line per event to stdout.
    Reads a single 'cancel' line from stdin if --cancel-on-stdin is passed.
    """
    if len(sys.argv) < 4:
        print(json.dumps({
            "type": "error",
            "message": "Usage: port_scanner.py <target> <start_port> <end_port> [timeout]"
        }), flush=True)
        sys.exit(1)

    target = sys.argv[1]
    try:
        start_port = int(sys.argv[2])
        end_port = int(sys.argv[3])
        timeout = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5
    except ValueError as exc:
        print(json.dumps({"type": "error", "message": f"Invalid argument: {exc}"}), flush=True)
        sys.exit(1)

    cancel_event = threading.Event()

    # Optional stdin cancel listener
    if "--cancel-on-stdin" in sys.argv:
        def _stdin_watcher() -> None:
            try:
                for line in sys.stdin:
                    if line.strip() == "cancel":
                        cancel_event.set()
                        break
            except Exception:
                pass
        threading.Thread(target=_stdin_watcher, daemon=True).start()

    try:
        scanner = PortScanner(target, start_port, end_port, timeout, cancel_event)
        for event in scanner.scan():
            print(json.dumps(event), flush=True)
    except Exception as exc:
        print(json.dumps({"type": "error", "message": str(exc)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    _cli()
