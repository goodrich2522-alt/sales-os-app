"""
proxy/app.py — ตัวครอบ Ollama สำหรับให้แอป static เรียกใช้ Typhoon OCR ได้อย่างปลอดภัย

ทำไมต้องมี proxy (ไม่เรียก Ollama ตรงๆ จากเบราว์เซอร์):
  1. Ollama ไม่มีระบบ auth — ถ้าเปิดออกเน็ตตรงๆ ใครก็เรียกได้
  2. แอปเป็น static (คนละโดเมน) — ต้องตั้ง CORS ให้เฉพาะโดเมนแอป
  3. รับ PDF สแกนมาแปลงเป็นรูปก่อนส่งเข้าโมเดล (โมเดลรับรูป)

Endpoint:
  POST /ocr   header: Authorization: Bearer <OCR_API_TOKEN>
              body (multipart): file=<รูป .png/.jpg หรือ .pdf>
              → { "markdown": "...", "model": "...", "pages": N }
  GET  /health → { "ok": true }
"""
import io
import os
import base64
import httpx
from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434")
OCR_MODEL = os.environ.get("OCR_MODEL", "scb10x/typhoon-ocr1.5-3b")
OCR_API_TOKEN = os.environ["OCR_API_TOKEN"]                       # บังคับตั้ง
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

# prompt ให้โมเดลคืนตารางเป็น Markdown (Typhoon OCR เข้าใจโครงสร้างเอกสารไทย)
OCR_PROMPT = (
    "อ่านเอกสารใบเสนอราคานี้ทั้งหมด แล้วคืนเป็น Markdown ให้ครบถ้วน "
    "โดยเฉพาะตารางรายการสินค้า (รุ่น/รหัส/จำนวน/ราคา/สเปก) ให้คงรูปแบบตารางไว้"
)

app = FastAPI(title="Typhoon OCR Proxy", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN] if ALLOWED_ORIGIN != "*" else ["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["Authorization", "Content-Type"],
)


def _check_auth(authorization: str | None):
    expected = f"Bearer {OCR_API_TOKEN}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="unauthorized")


def _pdf_to_images(data: bytes) -> list[bytes]:
    """แปลง PDF สแกนเป็นรูป PNG ต่อหน้า (ใช้ PyMuPDF — เร็ว ไม่ต้องพึ่ง poppler)"""
    import fitz  # PyMuPDF
    imgs: list[bytes] = []
    doc = fitz.open(stream=data, filetype="pdf")
    for page in doc:
        pix = page.get_pixmap(dpi=200)            # 200 dpi พอสำหรับ OCR ตาราง
        imgs.append(pix.tobytes("png"))
    doc.close()
    return imgs


async def _ollama_ocr(img_png: bytes) -> str:
    """ส่งรูป 1 หน้าเข้า Ollama typhoon-ocr → คืน markdown"""
    b64 = base64.b64encode(img_png).decode()
    payload = {
        "model": OCR_MODEL,
        "prompt": OCR_PROMPT,
        "images": [b64],
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=300) as client:
        r = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        r.raise_for_status()
        return r.json().get("response", "")


@app.get("/health")
async def health():
    return {"ok": True, "model": OCR_MODEL}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...), authorization: str | None = Header(default=None)):
    _check_auth(authorization)
    data = await file.read()
    name = (file.filename or "").lower()

    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        images = _pdf_to_images(data)
    else:
        images = [data]  # เป็นรูปอยู่แล้ว

    parts = []
    for img in images:
        parts.append(await _ollama_ocr(img))
    return JSONResponse({"markdown": "\n\n---\n\n".join(parts), "model": OCR_MODEL, "pages": len(images)})
