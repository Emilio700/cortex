# Multi-stage Dockerfile for FastAPI backend

# Base stage with Python and dependencies
FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Development stage
FROM base AS development

# Copy application code (will be overridden by volume in docker-compose)
COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Production stage
FROM base AS production

# Run as non-root user
RUN useradd -m -u 1000 appuser
COPY --chown=appuser:appuser . .
USER appuser

CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "-w", "4", "--bind", "0.0.0.0:8000", "app.main:app"]
