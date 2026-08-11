// lib/quoteImport/heli.ts — อ่านใบ HELI Sales Contract / Proforma Invoice (text layer)
// รูปแบบ: 1 ใบ = 1 รุ่น (บางใบหลายคันด้วย SN หลายตัว) · มี SN จริงติดมา
// ตัวอย่างแถวสินค้า: "1 CPCD35-Q22K2 K2 3T Diesel QUANCHA 490 M400 Black Solid 2 Valves & Pipings 1220 ... 010353N6726 THB 252,000.00 ..."

import { ParsedVehicle, QuoteParseResult } from "./types";

/** พลังงานจากคำในเอกสาร (อังกฤษ) → ไทย */
function fuelFromText(s: string): string | undefined {
  if (/diesel/i.test(s)) return "ดีเซล";
  if (/\b(lpg|gas)\b/i.test(s)) return "แก๊ส";
  if (/electric|li-?ion|lithium|battery/i.test(s)) return "ไฟฟ้า";
  return undefined;
}

/** ราคาทุน = ราคา "no vat" ตัวแรก (unit price ก่อน VAT) */
function firstPrice(s: string): number | undefined {
  const m = s.match(/THB\s*([\d,]+(?:\.\d{2})?)/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return isNaN(n) ? undefined : n;
}

export function parseHeli(rawText: string): QuoteParseResult {
  const text = rawText.replace(/\s+/g, " ").trim();

  // รหัสอ้างอิงนำเข้าจริงจากเอกสาร เช่น C20726201-001 — เก็บไว้อ้างอิง
  // ⛔ ไม่แปลงเป็นเลข PI เอง (เดิม -001 → PI001 ทำให้ชนเลข PI จริงของคันอื่น) · เว้น pi_no ว่างให้เติมเลข PI จริงทีหลัง
  const importRef = text.match(/\b([A-Z]\d{6,9}-\d{2,3})\b/)?.[1];
  // วันที่: 29-Dec-25
  const date = text.match(/\b(\d{1,2}-[A-Z][a-z]{2}-\d{2,4})\b/)?.[1];

  // ── หา "รุ่น" ทั้งหมดในเอกสาร (HELI = CPCD/CPD/CBD/CDD/CQD + เลข) ──
  // ครอบคลุมทุก prefix HELI: รถยก CPCD/CPD/PCD · รถคลัง CBD/CDD/CQD · รถลากไฟฟ้า CBS (ลงท้าย S ไม่ใช่ D)
  // เรียงยาว→สั้น (CPCD ก่อน CPD) ให้ match ถูกตัว
  const modelRe = /\b((?:CPCD|CPD|PCD|CBD|CDD|CQD|CBS)\d{1,3}[A-Z0-9-]*)/gi;
  const models = [...new Set([...text.matchAll(modelRe)].map((m) => m[1].toUpperCase()))];

  // ── หา SN ทั้งหมด — HELI มี SN 2 รูปแบบ ──
  //  · 6 ตัวเลข + 1 ตัวอักษร + 4 ตัวเลข  เช่น 010353N6726
  //  · 5 ตัวเลข + 3 ตัวอักษร + 3 ตัวเลข  เช่น 08015JVF574
  // ครอบคลุมด้วย \d{4,6}[A-Z]{1,3}\d{3,4} (ไม่ชนเลขทะเบียน/เลขบัญชีที่เป็นตัวเลขล้วน)
  const sns = [...new Set([...text.matchAll(/\b(\d{4,6}[A-Z]{1,3}\d{3,4})\b/g)].map((m) => m[1]))];

  const vehicles: ParsedVehicle[] = [];

  if (models.length === 0) {
    return { vendor: "HELI", pi_no: undefined, quote_date: date, vehicles: [], rawText };
  }

  // กรณีปกติ HELI = 1 รุ่นต่อใบ · จับคู่ SN ให้ครบ (1 คัน/SN)
  const model = models[0];
  const num = model.match(/\d{2,3}/)?.[0];            // 35 → 3.5 ตัน
  const capacity = num ? `${(Number(num) / 10).toFixed(1)} ตัน` : undefined;
  const fuel = fuelFromText(text) ?? (/^CPCD/.test(model) ? "ดีเซล" : /^(CPD|PCD|CBD|CDD|CQD|CBS)/.test(model) ? "ไฟฟ้า" : undefined);
  const mast = text.match(/\b(M\d{3}|ZSM\d{3,4}|ZM\d{3})\b/)?.[1];
  const valve = text.match(/(\d+)\s*Valves?/i)?.[1];
  const cost = firstPrice(text);

  const build = (sn?: string): ParsedVehicle => {
    const flags: string[] = [];
    if (!sn) flags.push("ไม่พบ SN");
    if (!cost) flags.push("ไม่พบราคาทุน");
    if (!mast) flags.push("ไม่พบ MAST");
    return {
      brand: "HELI", model, SN: sn, capacity, fuel, mast, valve,
      cost_price: cost, pi_no: undefined, import_ref: importRef, vendor: "HELI",
      flags: flags.length ? flags : undefined,
    };
  };

  if (sns.length === 0) vehicles.push(build(undefined));
  else sns.forEach((sn) => vehicles.push(build(sn)));

  // ถ้ามีหลายรุ่นในใบเดียว — ติดธงเตือนให้คนตรวจ (ตัวอย่างปัจจุบันไม่เจอ แต่กันไว้)
  if (models.length > 1) {
    vehicles.forEach((v) => (v.flags = [...(v.flags ?? []), `ใบนี้มีหลายรุ่น: ${models.join(", ")} — ตรวจว่าจับคู่ SN ถูก`]));
  }

  return { vendor: "HELI", pi_no: undefined, quote_date: date, vehicles, rawText };
}
