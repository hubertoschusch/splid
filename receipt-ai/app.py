import asyncio
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from paddleocr import PaddleOCR

MAX_FILE_SIZE = 25 * 1024 * 1024
pipeline: PaddleOCR | None = None
inference_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_: FastAPI):
    global pipeline
    pipeline = await asyncio.to_thread(
        PaddleOCR,
        lang=os.environ.get("PADDLEOCR_LANG", "german"),
        device="cpu",
        cpu_threads=int(os.environ.get("PADDLEOCR_CPU_THREADS", "4")),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    yield
    pipeline = None


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ready" if pipeline is not None else "loading"}


def result_payload(result: Any) -> dict[str, Any]:
    value = result.json
    return value.get("res", value) if isinstance(value, dict) else {}


def extract_text_and_lines(results: list[Any]):
    lines: list[dict[str, Any]] = []
    for result in results:
        payload = result_payload(result)
        texts = payload.get("rec_texts", [])
        scores = payload.get("rec_scores", [])
        boxes = payload.get("rec_boxes", [])
        for index, raw_text in enumerate(texts):
            text = str(raw_text).strip()
            if not text:
                continue
            score = float(scores[index]) if index < len(scores) else 0.0
            bbox = boxes[index] if index < len(boxes) else [0, 0, 0, 0]
            if len(bbox) != 4:
                bbox = [0, 0, 0, 0]
            lines.append(
                {
                    "text": text,
                    "confidence": score * 100,
                    "bbox": {
                        "x0": float(bbox[0]),
                        "y0": float(bbox[1]),
                        "x1": float(bbox[2]),
                        "y1": float(bbox[3]),
                    },
                }
            )
    confidence = (
        sum(line["confidence"] for line in lines) / len(lines) if lines else 0
    )
    return "\n".join(line["text"] for line in lines), confidence, lines


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    if pipeline is None:
        raise HTTPException(status_code=503, detail="Model is still loading")
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Unsupported image type")
    data = await file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Image is too large")

    suffix = Path(file.filename or "receipt.jpg").suffix or ".jpg"
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(data)
            path = handle.name
        async with inference_lock:
            results = await asyncio.to_thread(
                lambda: list(pipeline.predict(input=path))
            )
        text, confidence, lines = extract_text_and_lines(results)
        if not text:
            raise HTTPException(status_code=422, detail="No receipt text found")
        return {"text": text, "confidence": confidence, "lines": lines}
    finally:
        if path:
            Path(path).unlink(missing_ok=True)
