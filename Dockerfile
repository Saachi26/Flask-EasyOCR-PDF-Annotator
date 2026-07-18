# syntax=docker/dockerfile:1

# --- Stage 1: build the React frontend to static files ---
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python backend that also serves the built SPA ---
FROM python:3.11-slim AS app
WORKDIR /app

# System libs required by OpenCV.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install a MATCHED CPU-only torch + torchvision pair from the PyTorch CPU index.
# They must be installed together and pinned — a torch/torchvision mismatch causes
# "RuntimeError: operator torchvision::nms does not exist" when EasyOCR imports it.
RUN pip install --no-cache-dir \
        torch==2.3.1 torchvision==0.18.1 \
        --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt ./
# Install the rest. Keep the CPU wheel index available so nothing swaps in a CUDA
# build, and cap numpy<2 to stay ABI-compatible with this torch build.
RUN pip install --no-cache-dir \
        --extra-index-url https://download.pytorch.org/whl/cpu \
        "numpy<2" -r requirements.txt gunicorn

# Bake the EasyOCR models into the image so the first request isn't a slow download.
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

# Backend source + the frontend build output.
COPY server.py pipeline.py ocr_engines.py ./
COPY --from=frontend /app/frontend/dist ./frontend/dist

ENV PORT=7860 \
    OCR_ENGINE=easyocr \
    UPLOAD_FOLDER=/app/uploads
EXPOSE 7860

# Single worker (shared OCR model + in-memory job state), multiple threads for concurrency.
CMD ["sh", "-c", "gunicorn -w 1 --threads 8 --timeout 120 -b 0.0.0.0:${PORT} server:app"]
