// ── ระบบคำนวณค่าคอมมิชชั่นฝ่ายขาย (รายเดือน/รายบุคคล) ──
// เกณฑ์ (ตั้งโดยผู้ใช้ 29 ก.ค. 2026):
//  · STACKER (รุ่น RE/CDD/CBS) — คิดตาม "ยอดขาย": >100,000 = 800/คัน · ต่ำกว่า = 500/คัน
//  · FORKLIFT — คิดตาม "กำไรสุทธิ" + หมวดลูกค้า 3 แบบ (เลือกตอนปิดการขาย)
// กำไรสุทธิ = ราคาขาย − ทุน − อุปกรณ์เสริม − ของแถม(2,800) − ค่าขนส่ง
// นับเฉพาะดีลที่ "ปิด/จัดส่งแล้ว" ภายในเดือนนั้น
import { Sale, Forklift } from "./types";

// หมวดค่าคอมโฟล์คลิฟท์ — เก็บที่ sale.custom_fields["หมวดค่าคอม"]
export const COMMISSION_FIELD = "หมวดค่าคอม";
export const COMMISSION_CATEGORIES = ["ลูกค้าใหม่", "ลูกค้าใหม่+ออกพบเอง", "ลูกค้าเก่า/รับช่วงต่อ"] as const;
export type CommissionCategory = (typeof COMMISSION_CATEGORIES)[number];

// รุ่นสแตกเกอร์ที่คิดค่าคอมตามยอดขาย (RE/CDD/CBS)
export const isStackerModel = (model?: string) => /^(RE|CDD|CBS)/i.test(String(model ?? "").trim());

// ดีลปิดจริง (ปิด/จัดส่งแล้ว) — ค่าเก่า "ขายแล้ว"/"ปิดการขายแล้ว"/"ส่งมอบแล้ว" นับด้วย
export const isClosedSale = (s: Sale) => {
  const st = String(s.sale_status ?? "").trim();
  return st.includes("ปิดการขาย") || st.includes("จัดส่งแล้ว") || st.includes("ส่งมอบ") || st === "ขายแล้ว";
};

// วันที่ปิดการขาย (ใช้จัดกลุ่มรายเดือน) = วันส่งมอบ ถ้ามี ไม่งั้นวันที่สร้างดีล
export const closeDate = (s: Sale) => String(s.delivery_date || s.created_at || "").slice(0, 10);
export const closeMonth = (s: Sale) => closeDate(s).slice(0, 7); // YYYY-MM

// กำไรสุทธิของดีล
export const dealProfit = (s: Sale, f?: Forklift): number => {
  const revenue = Number(s.actual_sale) || 0;
  const cost    = Number(f?.cost_price) || 0;
  const addOns  = (s.add_ons ?? []).reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const free    = s.freebie ? 2800 : 0;
  const ship    = Number(s.shipping_cost) || 0;
  return revenue - cost - addOns - free - ship;
};

// ── ตารางค่าคอม ──
const stackerRate = (saleAmount: number) => (saleAmount > 100000 ? 800 : 500);

const forkliftNew = (p: number) =>          // ลูกค้าใหม่
  p >= 100000 ? 2000 : p >= 80000 ? 1500 : p >= 50000 ? 1000 : p >= 40000 ? 800 : p >= 30001 ? 700 : p >= 25000 ? 500 : 0;

const forkliftNewVisit = (p: number) =>     // ลูกค้าใหม่ + ออกพบเอง
  p >= 100000 ? 2000 : p >= 50000 ? 1200 : p >= 40000 ? 800 : 500; // ต่ำกว่า 40,000 → 500

const forkliftOld = (p: number) =>          // ลูกค้าเก่าบริษัท/รับช่วงต่อ
  p >= 100000 ? 1500 : p >= 40000 ? 800 : 500; // 40,000–99,999 → 800 · ต่ำกว่า → 500

export interface CommissionResult {
  amount: number;
  group: "STACKER" | "FORKLIFT" | "none";
  basis: "ยอดขาย" | "กำไร" | "-";
  basisValue: number;   // ยอดขาย (stacker) หรือ กำไรสุทธิ (forklift)
  category: string;     // หมวดลูกค้า (เฉพาะ forklift)
  note?: string;        // เตือนถ้าคิดไม่ได้ (ยังไม่เลือกหมวด / ไม่เข้าเงื่อนไข)
}

// คำนวณค่าคอม 1 ดีล
export const calcCommission = (s: Sale, f?: Forklift): CommissionResult => {
  const model = f?.model ?? s.forklift_model;
  const category = String(s.custom_fields?.[COMMISSION_FIELD] ?? "").trim();

  // STACKER (RE/CDD/CBS) → ตามยอดขาย
  if (isStackerModel(model)) {
    const saleAmount = Number(s.actual_sale) || 0;
    return { amount: stackerRate(saleAmount), group: "STACKER", basis: "ยอดขาย", basisValue: saleAmount, category: "" };
  }

  // FORKLIFT → ตามกำไรสุทธิ + หมวดลูกค้า
  const vtype = String(f?.vehicle_category ?? s.vehicle_type ?? "").trim();
  const isForklift = vtype === "Forklift" || vtype === "" || /^(CPC?D|CQD|CPD|FD|FG|H2000)/i.test(String(model ?? ""));
  if (!isForklift) {
    return { amount: 0, group: "none", basis: "-", basisValue: 0, category, note: "ไม่เข้าเงื่อนไขค่าคอม (คิดเอง)" };
  }
  const profit = dealProfit(s, f);
  if (!category) return { amount: 0, group: "FORKLIFT", basis: "กำไร", basisValue: profit, category: "", note: "ยังไม่เลือกหมวดลูกค้า" };

  let amount = 0;
  if (category === "ลูกค้าใหม่+ออกพบเอง") amount = forkliftNewVisit(profit);
  else if (category === "ลูกค้าเก่า/รับช่วงต่อ") amount = forkliftOld(profit);
  else amount = forkliftNew(profit); // "ลูกค้าใหม่"
  return { amount, group: "FORKLIFT", basis: "กำไร", basisValue: profit, category };
};
