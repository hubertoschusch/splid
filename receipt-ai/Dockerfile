FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ocr_pipeline.py ./

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OLLAMA_URL=http://receipt-llm:11434 \
    OLLAMA_MODEL=qwen3:4b-instruct \
    OLLAMA_TIMEOUT_SECONDS=300 \
    OLLAMA_NUM_PREDICT=1024 \
    OLLAMA_NUM_CTX=8192 \
    PADDLEOCR_DETECTION_MODEL=PP-OCRv5_mobile_det \
    PADDLEOCR_RECOGNITION_MODEL=latin_PP-OCRv5_mobile_rec \
    PADDLEOCR_CPU_THREADS=8 \
    PADDLEOCR_MAX_SIDE=2200

EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
