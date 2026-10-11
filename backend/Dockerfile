# PyArena API. Build from the repository root:
#   docker build -f backend/Dockerfile -t pyarena-backend .
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SEED_FILE=/app/seeds/questions.json

WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir .

COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY backend/docker-entrypoint.sh ./
COPY database/seeds/questions.json ./seeds/questions.json

RUN useradd --create-home --uid 10001 pyarena && chmod +x docker-entrypoint.sh
USER pyarena

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)"

ENTRYPOINT ["./docker-entrypoint.sh"]
