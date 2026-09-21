import asyncio
import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

MAX_FILE_SIZE = 25 * 1024 * 1024
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://receipt-llm:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3-vl:4b")
OLLAMA_TIMEOUT_SECONDS = int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "300"))
inference_lock = asyncio.Lock()

RECEIPT_SCHEMA = {
    "type": "object",
    "properties": {
        "merchant": {"type": ["string", "null"]},
        "date": {"type": ["string", "null"], "description": "ISO date (YYYY-MM-DD)"},
        "currency": {"type": ["string", "null"], "description": "ISO 4217 code"},
        "subtotal": {"type": ["number", "null"]},
        "tax": {"type": ["number", "null"]},
        "total": {"type": ["number", "null"]},
        "items": {
            "type": "array",
            "maxItems": 500,
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "quantity": {"type": ["number", "null"]},
                    "unitPrice": {"type": ["number", "null"]},
                    "total": {"type": "number"},
                },
                "required": ["name", "quantity", "unitPrice", "total"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["merchant", "date", "currency", "subtotal", "tax", "total", "items"],
    "additionalProperties": False,
}

app = FastAPI()


def ollama_request(path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(
        f"{OLLAMA_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST" if data is not None else "GET",
    )
    with urllib.request.urlopen(request, timeout=OLLAMA_TIMEOUT_SECONDS) as response:
        value = json.load(response)
        return value if isinstance(value, dict) else {}


def model_available() -> bool:
    try:
        ollama_request("/api/show", {"model": OLLAMA_MODEL})
        return True
    except (OSError, urllib.error.URLError, urllib.error.HTTPError, ValueError):
        return False


@app.get("/health")
async def health():
    ready = await asyncio.to_thread(model_available)
    return JSONResponse(
        {"status": "ready" if ready else "loading", "model": OLLAMA_MODEL},
        status_code=200 if ready else 503,
    )


def clean_receipt(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or not isinstance(value.get("items"), list):
        raise ValueError("The model did not return a receipt")
    cleaned_items = []
    for item in value["items"][:500]:
        if not isinstance(item, dict):
            continue
        name, total = item.get("name"), item.get("total")
        if not isinstance(name, str) or not name.strip() or not isinstance(total, (int, float)):
            continue
        cleaned_items.append({
            "name": name.strip()[:200],
            "quantity": item.get("quantity") if isinstance(item.get("quantity"), (int, float)) else None,
            "unitPrice": item.get("unitPrice") if isinstance(item.get("unitPrice"), (int, float)) else None,
            "total": round(float(total), 2),
        })

    def nullable_number(key: str):
        number = value.get(key)
        return round(float(number), 2) if isinstance(number, (int, float)) else None

    return {
        "merchant": value.get("merchant")[:200] if isinstance(value.get("merchant"), str) else None,
        "date": value.get("date") if isinstance(value.get("date"), str) else None,
        "currency": value.get("currency")[:3].upper() if isinstance(value.get("currency"), str) else None,
        "subtotal": nullable_number("subtotal"),
        "tax": nullable_number("tax"),
        "total": nullable_number("total"),
        "items": cleaned_items,
    }


def analyze_with_qwen(data: bytes, language: str) -> dict[str, Any]:
    prompt = f"""Extract this receipt in language {language}. Return only the requested JSON schema.
Copy values exactly from the image. Never invent unreadable products or amounts; omit unreadable
products and use null for unreadable optional fields. Include every purchased product, fee and
discount as a separate item. The item total is the printed line total after quantity and discounts;
discount totals must be negative. Do not include subtotal, tax, payment, change or grand total as
items. Use ISO 4217 currency and YYYY-MM-DD date. Check the item sum against the printed total."""
    response = ollama_request("/api/chat", {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": RECEIPT_SCHEMA,
        "messages": [{"role": "user", "content": prompt, "images": [base64.b64encode(data).decode("ascii")]}],
        "options": {"temperature": 0},
    })
    content = response.get("message", {}).get("content")
    if not isinstance(content, str):
        raise ValueError("The model returned no content")
    receipt = clean_receipt(json.loads(content))
    lines = [receipt["merchant"]] if receipt["merchant"] else []
    lines.extend(f'{item["name"]} {item["total"]:.2f}' for item in receipt["items"])
    if receipt["total"] is not None:
        currency = f' {receipt["currency"]}' if receipt["currency"] else ""
        lines.append(f'TOTAL {receipt["total"]:.2f}{currency}')
    item_sum = round(sum(item["total"] for item in receipt["items"]), 2)
    reconciles = receipt["total"] is not None and abs(item_sum - receipt["total"]) <= 0.02
    return {"text": "\n".join(filter(None, lines)), "confidence": 100 if reconciles else 60, "lines": [], "receipt": receipt}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...), language: str = Form(...)):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Unsupported image type")
    data = await file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Image is too large")
    if not data:
        raise HTTPException(status_code=400, detail="Receipt image is empty")
    if inference_lock.locked():
        raise HTTPException(status_code=429, detail="Receipt model is busy")
    if not await asyncio.to_thread(model_available):
        raise HTTPException(status_code=503, detail="Qwen receipt model is not ready")
    try:
        async with inference_lock:
            return await asyncio.to_thread(analyze_with_qwen, data, language)
    except ValueError:
        raise HTTPException(status_code=422, detail="No structured receipt data found")
    except (OSError, urllib.error.URLError, urllib.error.HTTPError):
        raise HTTPException(status_code=503, detail="Qwen receipt model is unavailable")
