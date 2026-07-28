# เซิร์ฟเวอร์ Typhoon OCR 1.5 — อ่านใบเสนอราคา HANGCHA (สแกน)

> ส่วนหนึ่งของ **เฟส 4** ([FEATURE-PLAN.md](../FEATURE-PLAN.md)) — โมเดล OCR ภาษาไทยของ SCB 10X
> **รันในเครื่องบริษัท 100% — ข้อมูลใบเสนอราคา (ราคาทุน/ลูกค้า) ไม่ออกนอกองค์กร**
>
> ⚠️ โฟลเดอร์นี้ deploy บน **เซิร์ฟเวอร์ของบริษัท** (ไม่เกี่ยวกับ GitHub Pages ที่โฮสต์ตัวแอป)

---

## ต้องมีอะไรบ้าง

- เครื่อง Linux (Ubuntu 22.04+) ที่ติดตั้ง **Docker** + **Docker Compose**
- RAM ≥ 8 GB · ดิสก์ว่าง ≥ 10 GB (โมเดล ~3–4 GB)
- **GPU NVIDIA (แนะนำ)** — เร็วกว่ามาก แต่ CPU ก็รันได้ (ช้ากว่า ~10–20 วินาที/หน้า)
- โมเดลอ้างอิง: [`scb10x/typhoon-ocr1.5-3b`](https://ollama.com/scb10x/typhoon-ocr1.5-3b) บน Ollama

---

## ติดตั้ง (ครั้งเดียว)

```bash
# 1) เข้าโฟลเดอร์นี้บนเซิร์ฟเวอร์
cd ocr-server

# 2) ตั้งค่าลับ — สร้างไฟล์ .env (อย่า commit)
cat > .env <<'ENV'
OCR_API_TOKEN=เปลี่ยนเป็นโทเคนยาวๆสุ่มเอง_อย่างน้อย32ตัว
ALLOWED_ORIGIN=https://goodrich2522-alt.github.io
ENV

# 3) สตาร์ท (โหลด image ครั้งแรกอาจนาน)
docker compose up -d

# 4) โหลดโมเดล Typhoon เข้า Ollama (ครั้งเดียว ~3-4GB)
docker exec typhoon-ollama ollama pull scb10x/typhoon-ocr1.5-3b
```

> **มี GPU?** เปิดคอมเมนต์บล็อก `deploy.resources` ใน [docker-compose.yml](docker-compose.yml) แล้ว `docker compose up -d` ใหม่

---

## ทดสอบว่าใช้ได้

```bash
# เช็คว่าเซิร์ฟเวอร์ตอบ
curl http://localhost:8080/health
# → {"ok":true,"model":"scb10x/typhoon-ocr1.5-3b"}

# ลองอ่านไฟล์สแกนจริง (แทน TOKEN ด้วยค่าใน .env)
curl -X POST http://localhost:8080/ocr \
  -H "Authorization: Bearer <OCR_API_TOKEN>" \
  -F "file=@ตัวอย่างใบเสนอราคา.pdf"
# → {"markdown":"| รุ่น | จำนวน | ราคา |...","pages":2}
```

---

## เชื่อมกับแอป

หลังเซิร์ฟเวอร์รันได้ ตั้ง 2 ค่านี้ใน **GitHub → Settings ▸ Secrets and variables ▸ Actions ▸ Variables** ของ repo แอป:

| ตัวแปร | ค่า |
|--------|-----|
| `NEXT_PUBLIC_OCR_URL` | `https://<โดเมนเซิร์ฟเวอร์บริษัท>:8080` |
| `NEXT_PUBLIC_OCR_TOKEN` | โทเคนเดียวกับ `OCR_API_TOKEN` |

> 🔒 **ควรมี HTTPS** หน้าเซิร์ฟเวอร์ (reverse proxy เช่น Caddy/nginx) — เบราว์เซอร์บล็อกการเรียก http จากหน้า https
> โทเคนนี้จะฝังในตัวแอป (public) — เป็นแค่ด่านกันสแปมพื้นฐาน จำกัด origin + rate limit ที่ reverse proxy ด้วย

---

## สถาปัตยกรรม

```
เบราว์เซอร์ (แอป static)                    เซิร์ฟเวอร์บริษัท (โฟลเดอร์นี้)
──────────────────────                     ─────────────────────────────
ใบเสนอราคา HANGCHA (สแกน)
   └── POST /ocr + token ──────────────►  proxy (FastAPI :8080)
                                              ├─ เช็ค token + origin
                                              ├─ PDF→รูป (PyMuPDF)
                                              └─ เรียก ──► ollama :11434
                                                           typhoon-ocr1.5-3b
   ◄──────── { markdown } ──────────────────┘  (โมเดลอยู่ในเครื่อง ไม่ออกเน็ต)
```

> **3 ใน 4 เจ้า (HELI/STAXX/ROCKMAN) ไม่ต้องใช้เซิร์ฟเวอร์นี้** — PDF มี text layer อ่านด้วย pdf.js ในเบราว์เซอร์ได้เลย
> เซิร์ฟเวอร์นี้ใช้เฉพาะ **HANGCHA ที่เป็นสแกน**
