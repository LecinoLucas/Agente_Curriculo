FROM python:3.13-slim

WORKDIR /app

# System deps: libpq for asyncpg, poppler + tesseract for PDF/OCR processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    curl \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-por \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (layer cache)
COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

EXPOSE 8000

# Default: run API server. Override CMD for worker or migrations.
CMD ["uvicorn", "src.interface.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
