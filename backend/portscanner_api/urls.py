"""
URL routes for the portscanner_api app.
All paths are relative to /api/ (defined in the root urls.py).
"""
from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("scan/start/", views.StartScanView.as_view(), name="scan-start"),
    path("scan/<str:scan_id>/stream/", views.ScanStreamView.as_view(), name="scan-stream"),
    path("scan/<str:scan_id>/cancel/", views.CancelScanView.as_view(), name="scan-cancel"),
    path("scan/<str:scan_id>/", views.ScanDetailView.as_view(), name="scan-detail"),
    path("scans/", views.ScanListView.as_view(), name="scan-list"),
]
