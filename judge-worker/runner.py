"""Entry point for the judge worker.

Run locally (development):
    uvicorn runner:app --host 127.0.0.1 --port 8001

In Docker the container starts this module with uvicorn as well.
"""

from worker.app import create_app

app = create_app()
