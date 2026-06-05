FROM python:3.12-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc curl poppler-utils tesseract-ocr tesseract-ocr-por \
    && rm -rf /var/lib/apt/lists/*

RUN pip install poetry==1.8.3

COPY pyproject.toml poetry.lock* ./

RUN poetry config virtualenvs.create false \
    && poetry install --only main --no-interaction --no-ansi

COPY . .

EXPOSE 8000

CMD ["uvicorn", "src.interface.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
