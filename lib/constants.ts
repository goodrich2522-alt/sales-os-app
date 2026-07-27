// lib/constants.ts — ค่าคงที่ที่ใช้ร่วมทั้งแอป (เฟส 1: รวมของซ้ำมาไว้ที่เดียว)
// เดิมกระจายซ้ำในหน้า sales/stock/dashboard ค่าไม่ตรงกัน + สถานะใหม่ไม่มีสี → รวมที่นี่ที่เดียว

// ── สีป้ายสถานะรถ (forklift.status) ─────────────────────────────────────────
// ครอบคลุมทุกสถานะที่ใช้จริง รวมของใหม่ (สั่งผลิต/รถเช่า/เคลม/รับกลับ) ที่เดิมไม่มีสี
export const STATUS_BADGE: Record<string, string> = {
  "พร้อมขาย":       "bg-emerald-100 text-emerald-700 border-emerald-200",
  "จอง":            "bg-amber-100 text-amber-700 border-amber-200",
  "จองแล้ว":        "bg-amber-100 text-amber-700 border-amber-200",
  "ติดจอง":         "bg-amber-100 text-amber-700 border-amber-200",
  "ติดจอง/รอส่ง":   "bg-orange-100 text-orange-700 border-orange-200",
  "รอรับ":          "bg-sky-100 text-sky-700 border-sky-200",
  "รอผ่านไฟแนนซ์":  "bg-red-100 text-red-700 border-red-200",
  "สั่งผลิต":        "bg-violet-100 text-violet-700 border-violet-200",
  "รถเช่า":          "bg-teal-100 text-teal-700 border-teal-200",
  "เคลม/รับกลับ":    "bg-rose-100 text-rose-700 border-rose-200",
  "ปิดการขายแล้ว":  "bg-indigo-100 text-indigo-700 border-indigo-200",
  "ส่งมอบแล้ว":     "bg-slate-100 text-slate-600 border-slate-200",
  "ซ่อมบำรุง":      "bg-red-100 text-red-700 border-red-200",
  "รอตรวจสอบ":     "bg-blue-100 text-blue-700 border-blue-200",
};

/** สีป้ายสถานะ — ถ้าไม่รู้จักสถานะ คืนสีเทากลางๆ (กันจอพังเมื่อเจอค่าสะกดแปลก) */
export const statusBadgeClass = (status: unknown): string =>
  STATUS_BADGE[String(status ?? "").trim()] ?? "bg-slate-100 text-slate-600 border-slate-200";

// ── สีป้ายสถานะการขาย (sale.sale_status) ────────────────────────────────────
export const SALE_STATUS_BADGE: Record<string, string> = {
  "ขายแล้ว":        "bg-emerald-100 text-emerald-700 border-emerald-200",
  "จอง":            "bg-amber-100 text-amber-700 border-amber-200",
  "รอผ่านไฟแนนซ์":  "bg-red-100 text-red-700 border-red-200",
};

export const saleStatusBadgeClass = (status: unknown): string =>
  SALE_STATUS_BADGE[String(status ?? "ขายแล้ว").trim()] ?? "bg-slate-100 text-slate-600 border-slate-200";

// ── สีแท็กแหล่งที่มาลูกค้า (sale.contact_source) ─────────────────────────────
export const CONTACT_SOURCE_COLORS: Record<string, string> = {
  "Line":          "bg-green-100 text-green-700",
  "Facebook":      "bg-blue-100 text-blue-700",
  "TikTok":        "bg-pink-100 text-pink-700",
  "โทร":           "bg-indigo-100 text-indigo-700",
  "Google":        "bg-orange-100 text-orange-700",
  "คนอื่นบอกต่อ":  "bg-violet-100 text-violet-700",
};

export const contactSourceClass = (source: unknown): string =>
  CONTACT_SOURCE_COLORS[String(source ?? "").trim()] ?? "bg-slate-100 text-slate-600";

// ── ชื่อเดือนไทยแบบย่อ (index 1-12 = ม.ค.-ธ.ค.) ──────────────────────────────
// ⚠️ ใช้ผ่านฟังก์ชันใน lib/format.ts เท่านั้น — อย่าอ้าง index ตรงๆ (เดิมมี 2 แบบ index ต่างกันจนวันที่เพี้ยน)
export const TH_MONTHS_1BASED = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;
