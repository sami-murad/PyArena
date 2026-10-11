# PyArena judge worker: runs untrusted Python in restricted, per-job processes.
#
# The process starts as root *inside the container* only so it can give every
# job its own unprivileged UID and kill everything that UID started. Docker
# Compose drops all capabilities except the few this needs, makes the root
# filesystem read-only, and keeps the container off the internet.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    WORKER_WORK_ROOT=/sandbox \
    WORKER_ENABLE_DIAG=false \
    WORKER_SECCOMP=required

WORKDIR /worker
COPY requirements.txt .
# The last two commands fail the build early if the interpreter the sandbox
# launches is missing or lacks the modules it depends on. The official image
# already provides python3 at /usr/local/bin, so no symlink is needed. libseccomp2
# (usually already present) is installed explicitly for the per-job seccomp filter.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libseccomp2 \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -r requirements.txt \
    && mkdir -p /sandbox \
    && python3 -c "import sys, resource, importlib.util; assert sys.version_info >= (3, 12); print('python ok', sys.version)" \
    && test "$(command -v python3)" = "/usr/local/bin/python3"

COPY worker ./worker
COPY seccomp ./seccomp
COPY runner.py .
# Fail the build if the per-job seccomp filter cannot be compiled (libseccomp2
# ships with the Debian base image; WORKER_SECCOMP=required makes the worker
# refuse to start without it at run time too).
RUN python3 -c "from worker.seccomp import compile_filter; f = compile_filter(); print('seccomp ok', len(f.denied_syscalls), 'syscalls denied')"

EXPOSE 8001
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2)"

# On SIGTERM, running jobs get up to 25 s to finish (compose allows 30 s).
CMD ["uvicorn", "runner:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1", "--timeout-graceful-shutdown", "25"]
