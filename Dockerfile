FROM python:3.13-slim-bookworm

# Prevent python from buffering stdout/stderr and generating .pyc files
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# Install system dependencies (libgomp1 is required for LightGBM OpenMP support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source, data, ML models, frontend, and configuration
COPY app/ app/
COPY data/ data/
COPY ml/ ml/
COPY frontend/ frontend/
COPY scripts/ scripts/
COPY pytest.ini .


# Expose HTTP / WebSocket port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Launch FastAPI application with strictly 1 worker
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
