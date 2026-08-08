// lib/forkliftCsv.ts — อัปโหลดรถหลายคันจากไฟล์ CSV (เปิด/แก้ใน Excel แล้ว Save As CSV)
// รองรับหัวคอลัมน์ภาษาไทย · สร้างรหัสสินค้าอัตโนมัติเหมือนกรอกมือ

import type { Forklift } from "./types";
import { buildForkliftId } from "./productId";

// ── แม่แบบคอลัมน์ (ต้องตรงกับหัวใน CSV — จับคู่แบบไม่สนตัวพิมพ์/ช่องว่าง) ──
export const CSV_COLUMNS = [
  { key: "SN",       label: "SN",           required: true },
  { key: "brand",         label: "ยี่ห้อ",        required: false },
  { key: "model",         label: "รุ่น",          required: true },
  { key: "capacity_kg",   label: "น้ำหนักยก(กก.)", required: false },
  { key: "height",        label: "ยกสูง(เมตร)",   required: false },
  { key: "fork_length",   label: "ความยาวงา(มม.)", required: false },
  { key: "fuel",          label: "พลังงาน",       required: false },
  { key: "vehicle_category", label: "หมวดรถ",     required: false }, // Forklift/Stacker/Handlift
  { key: "control_type",  label: "Valve",         required: false },
  { key: "pi_no",         label: "PI",            required: false },
  { key: "cost_price",    label: "ราคาทุน",        required: false },
  { key: "received_date", label: "วันรับรถ",      required: false }, // YYYY-MM-DD
  { key: "status",        label: "สถานะ",         required: false },
] as const;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "").replace(/[.,]/g, "");

// ── สถานะเริ่มต้นตอนนำเข้ารถใหม่ (ถ้าไฟล์ไม่ระบุสถานะ) ──
// ยี่ห้อล็อตตู้ (STAXX/CNC/เจนบรรเจิด) เข้ามาเป็นล็อต ข้ามขั้นรับรถ → "พร้อมขาย" เลย
// โฟล์คลิฟท์ยี่ห้ออื่น (HELI/HANGCHA) ต้องผ่านหน้ารับรถก่อน → "รอรับ" (เด้งเข้าหน้าผู้ขนส่งอัตโนมัติ)
export function defaultImportStatus(brand: string): string {
  const b = (brand || "").trim();
  const isContainerLot = b.toUpperCase() === "STAXX" || b.toUpperCase() === "CNC" || b === "เจนบรรเจิด";
  return isContainerLot ? "พร้อมขาย" : "รอรับ";
}

// ── แยกบรรทัด CSV (รองรับค่าในเครื่องหมายคำพูด + คอมมาในค่า) ──
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export interface CsvParseResult {
  forklifts: Omit<Forklift, "id">[];
  errors: string[];
  rowCount: number;
}

const VALID_CATS = ["Forklift", "Stacker", "Handlift"];

// แปลงเนื้อไฟล์ CSV → รายการรถ (ยังไม่ใส่ id — ให้ตัวเรียกออกรหัสตอนบันทึก)
export function parseForkliftCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  // ตัด BOM + แยกบรรทัด (รองรับ \r\n และ \n) + ทิ้งบรรทัดว่าง
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return { forklifts: [], errors: ["ไฟล์ว่างหรือมีแต่หัวตาราง — ต้องมีข้อมูลอย่างน้อย 1 แถว"], rowCount: 0 };

  const header = splitCsvLine(lines[0]).map(norm);
  // จับคู่ตำแหน่งคอลัมน์จากหัวตาราง
  const colIdx: Record<string, number> = {};
  CSV_COLUMNS.forEach(c => { colIdx[c.key] = header.indexOf(norm(c.label)); });

  if (colIdx.SN < 0 || colIdx.model < 0) {
    errors.push("ไม่พบคอลัมน์ที่จำเป็น: ต้องมีหัวตาราง \"SN\" และ \"รุ่น\" (ใช้ปุ่มดาวน์โหลดแม่แบบเพื่อความถูกต้อง)");
    return { forklifts: [], errors, rowCount: 0 };
  }

  const forklifts: Omit<Forklift, "id">[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const get = (k: string) => { const i = colIdx[k]; return i >= 0 && i < cells.length ? cells[i].trim() : ""; };
    const sn = get("SN"), model = get("model");
    if (!sn && !model) continue; // ข้ามแถวว่าง
    if (!sn)    { errors.push(`แถว ${r + 1}: ไม่มี SN — ข้าม`); continue; }
    if (!model) { errors.push(`แถว ${r + 1}: ไม่มีรุ่น — ข้าม`); continue; }

    let cat = get("vehicle_category").trim();
    if (cat && !VALID_CATS.includes(cat)) cat = ""; // ค่าไม่ถูกต้อง → ปล่อยว่าง (ค่าเริ่มต้น Forklift)
    const costRaw = get("cost_price").replace(/[,\s฿]/g, "");
    const cost = costRaw && !isNaN(Number(costRaw)) ? Number(costRaw) : 0;

    forklifts.push({
      SN: sn.toUpperCase(),
      brand: get("brand") || "HELI",
      model,
      capacity: "",
      capacity_kg: get("capacity_kg") || undefined,
      height: get("height") || "",
      fork_length: get("fork_length") || undefined,
      fuel: get("fuel") || "",
      vehicle_category: (cat || "Forklift") as Forklift["vehicle_category"],
      control_type: get("control_type") || undefined,
      pi_no: get("pi_no") || undefined,
      cost_price: cost,
      stock_price: 0,
      received_date: get("received_date") || undefined,
      status: get("status") || defaultImportStatus(get("brand") || "HELI"),
      created_at: "", // ตัวเรียกจะเติมเวลาจริงตอนบันทึก
    });
  }
  return { forklifts, errors, rowCount: forklifts.length };
}

// ออกรหัสรถให้ครบทุกคัน — ใช้ SN เป็นรหัส (ดู SN-RULES.md) + เติมเวลา
export function assignIdsAndStamp(rows: Omit<Forklift, "id">[], existing: Pick<Forklift, "id">[]): Forklift[] {
  const pool = [...existing];
  const now = new Date().toISOString();
  return rows.map(r => {
    const id = buildForkliftId(r.SN ?? "", r.pi_no ?? "", pool);
    pool.push({ id }); // ให้คันถัดไปไม่ชนกันเองในไฟล์เดียว
    return { ...r, id, created_at: now };
  });
}

// สร้างเนื้อไฟล์ CSV แม่แบบ (พร้อม BOM ให้ Excel อ่านภาษาไทยถูก) + ตัวอย่าง 1 แถว
export function buildCsvTemplate(): string {
  const header = CSV_COLUMNS.map(c => c.label).join(",");
  // เว้นสถานะว่าง = ใช้ค่าเริ่มต้นอัตโนมัติ (โฟล์คลิฟท์→รอรับ ส่งเข้าหน้ารับรถ · STAXX/CNC→พร้อมขาย)
  const example = ["SN12345", "HELI", "CPCD30", "3000", "3", "1070", "ดีเซล", "Forklift", "", "PI001", "250000", "2026-07-01", ""].join(",");
  return "﻿" + header + "\n" + example + "\n";
}
