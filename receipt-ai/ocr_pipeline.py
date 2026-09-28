import io
import os
import threading
from typing import Any


PADDLEOCR_DETECTION_MODEL = os.environ.get(
    "PADDLEOCR_DETECTION_MODEL", "PP-OCRv5_mobile_det"
)
PADDLEOCR_RECOGNITION_MODEL = os.environ.get(
    "PADDLEOCR_RECOGNITION_MODEL", "latin_PP-OCRv5_mobile_rec"
)
PADDLEOCR_MAX_SIDE = int(os.environ.get("PADDLEOCR_MAX_SIDE", "2200"))
PADDLEOCR_MAX_PIXELS = int(os.environ.get("PADDLEOCR_MAX_PIXELS", "40000000"))
PADDLEOCR_CPU_THREADS = int(os.environ.get("PADDLEOCR_CPU_THREADS", "8"))
MAX_OCR_LINES = int(os.environ.get("MAX_OCR_LINES", "250"))

_ocr_engine: Any | None = None
_ocr_engine_lock = threading.Lock()


class OcrUnavailableError(RuntimeError):
    pass


def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is not None:
        return _ocr_engine
    with _ocr_engine_lock:
        if _ocr_engine is not None:
            return _ocr_engine
        try:
            from paddleocr import PaddleOCR
        except ImportError as error:
            raise OcrUnavailableError("PaddleOCR is not installed") from error
        _ocr_engine = PaddleOCR(
            text_detection_model_name=PADDLEOCR_DETECTION_MODEL,
            text_recognition_model_name=PADDLEOCR_RECOGNITION_MODEL,
            device="cpu",
            # PaddlePaddle 3.3 cannot execute this model through OneDNN reliably.
            enable_mkldnn=False,
            cpu_threads=PADDLEOCR_CPU_THREADS,
            use_doc_orientation_classify=True,
            use_doc_unwarping=True,
            use_textline_orientation=True,
        )
    return _ocr_engine


def ocr_ready() -> bool:
    return _ocr_engine is not None


def decode_image(data: bytes):
    try:
        import numpy as np
        from PIL import Image, ImageOps

        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > PADDLEOCR_MAX_PIXELS:
                raise ValueError("The receipt image has too many pixels")
            image = ImageOps.exif_transpose(source).convert("RGB")
            width, height = image.size
            largest_side = max(width, height)
            if largest_side > PADDLEOCR_MAX_SIDE:
                scale = PADDLEOCR_MAX_SIDE / largest_side
                image = image.resize(
                    (max(1, round(width * scale)), max(1, round(height * scale))),
                    Image.Resampling.LANCZOS,
                )
            # PaddleOCR accepts OpenCV-style BGR numpy arrays.
            return np.asarray(image)[:, :, ::-1]
    except (OSError, ValueError) as error:
        raise ValueError("The uploaded file is not a readable receipt image") from error


def _payload(result: Any) -> dict[str, Any]:
    value = result if isinstance(result, dict) else getattr(result, "json", {})
    if callable(value):
        value = value()
    if isinstance(value, str):
        import json

        value = json.loads(value)
    if not isinstance(value, dict):
        return {}
    nested = value.get("res")
    return nested if isinstance(nested, dict) else value


def _rectangle(polygon: Any) -> tuple[float, float, float, float] | None:
    try:
        values = polygon.tolist() if hasattr(polygon, "tolist") else polygon
        if len(values) == 4 and all(isinstance(value, (int, float)) for value in values):
            x0, y0, x1, y1 = values
            return float(x0), float(y0), float(x1), float(y1)
        xs = [float(point[0]) for point in values]
        ys = [float(point[1]) for point in values]
        return min(xs), min(ys), max(xs), max(ys)
    except (IndexError, TypeError, ValueError):
        return None


def extract_lines(results: Any, width: int, height: int) -> list[dict[str, Any]]:
    if not isinstance(results, (list, tuple)):
        results = list(results)
    extracted = []
    for result in results:
        value = _payload(result)
        texts = value.get("rec_texts", [])
        scores = value.get("rec_scores", [])
        polygons = value.get("rec_boxes")
        if polygons is None:
            polygons = value.get("rec_polys")
        if polygons is None:
            polygons = []
        for text, score, polygon in zip(texts, scores, polygons):
            rectangle = _rectangle(polygon)
            if not isinstance(text, str) or not text.strip() or rectangle is None:
                continue
            x0, y0, x1, y1 = rectangle
            extracted.append(
                {
                    "text": text.strip()[:500],
                    "confidence": round(max(0.0, min(100.0, float(score) * 100)), 1),
                    "bbox": {
                        "x0": round(max(0.0, min(1000.0, x0 / width * 1000)), 1),
                        "y0": round(max(0.0, min(1000.0, y0 / height * 1000)), 1),
                        "x1": round(max(0.0, min(1000.0, x1 / width * 1000)), 1),
                        "y1": round(max(0.0, min(1000.0, y1 / height * 1000)), 1),
                    },
                }
            )
    extracted.sort(key=lambda line: (line["bbox"]["y0"], line["bbox"]["x0"]))
    return extracted[:MAX_OCR_LINES]


def recognize_receipt(data: bytes) -> list[dict[str, Any]]:
    image = decode_image(data)
    height, width = image.shape[:2]
    results = get_ocr_engine().predict(image)
    lines = extract_lines(results, width, height)
    if not lines:
        raise ValueError("PaddleOCR found no text in the receipt image")
    return lines
