// lib/productId.ts — รหัสสินค้าอัตโนมัติ (Product ID)
// รูปแบบ: FK-0001 / ST-0001 / HL-0001 — แยกรันนัมเบอร์ตามไลน์สินค้า
// รหัสนี้ = id หลักของรถในระบบ (forklifts.id) ใช้อ้างอิงได้ทุกจุด:
// ดีลขาย (forklift_id), ค้นหาหน้าเซลล์, รับรถหน้าผู้ขนส่ง
import { Forklift } from "./types";

const CATEGORY_PREFIX: Record<string, string> = {
  Forklift: "FK",
  Stacker:  "ST",
  Handlift: "HL",
};

/** รหัสนี้เป็นรหัสสินค้าอัตโนมัติหรือไม่ (ไว้เลือกโชว์เฉพาะรหัสรูปแบบใหม่) */
export function isProductId(id: unknown): boolean {
  return /^(FK|ST|HL)-\d{4,}$/.test(String(id ?? ""));
}

/**
 * สร้างรหัสสินค้าตัวถัดไปจากรายการรถที่มีอยู่
 * หาเลขสูงสุดของ prefix เดียวกันแล้ว +1 (รถ id แบบเก่า เช่น timestamp ไม่ถูกนับ)
 */
export function generateProductId(
  category: string,
  forklifts: Pick<Forklift, "id">[],
): string {
  const prefix = CATEGORY_PREFIX[category] ?? "FK";
  const re = new RegExp(`^${prefix}-(\\d{4,})$`);
  let max = 0;
  forklifts.forEach(f => {
    const m = re.exec(String(f.id ?? ""));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}
