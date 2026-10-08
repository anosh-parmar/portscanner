"""
Root URL configuration.
"""
from django.urls import path, include

urlpatterns = [
    path("api/", include("portscanner_api.urls")),
]
