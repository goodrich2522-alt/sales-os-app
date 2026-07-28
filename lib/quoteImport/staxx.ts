// lib/quoteImport/staxx.ts — อ่าน Serial No. List ของ STAXX (Excel)
// STAXX ต่างจาก HELI: ใบ Proforma ไม่มี SN (สั่งผลิต) · SN จริงมาทีหลังใน Excel เป็น "ช่วง"
// รูปแบบ Excel: PI No. | รุ่น (Item/Model No.) | QTY | Serial No. (เช่น 51596-1~51596-12)

import { ParsedVehicle } from "./types";

/** พิกัดยก (kg) จากรหัสรุ่น STAXX — hand pallet เลข 2 หลักแรก×100 · stacker เลขในรุ่น */
function staxxCapacityKg(model: string): string | undefined {
  const m = model.replace(/\s/g, "").toUpperCase();
  const hp = m.match(/^(AC|BF|BFD|BFL|PWH|WS|CNS)(\d{2})/);
  if (hp) return String(Number(hp[2]) * 100);          // BF25→2500 · AC50→5000
  const st = m.match(/^(EPS|PS|WMS|WDS|SDA)(\d{3,4})/);
  if (st) return st[2];                                 // EPS400→400 · WMS1500→1500
  return undefined;
}

/** แตกช่วง SN "51596-1~51596-12" → ["51596-1", ..., "51596-12"] */
export function expandSnRange(range: string): string[] {
  const s = String(range || "").trim();
  if (!s) return [];
  const parts = s.split(/\s*[~～－]\s*/).filter(Boolean);   // รองรับ ~ ～ － (ขีดยาว)
  if (parts.length < 2) return [s];                          // SN เดี่ยว
  const fm = parts[0].match(/^(.*?)(\d+)$/);
  const tm = parts[parts.length - 1].match(/^(.*?)(\d+)$/);
  if (!fm || !tm) return parts;
  const prefix = fm[1];
  const start = Number(fm[2]), end = Number(tm[2]);
  if (!(end >= start) || end - start > 2000) return parts;   // กันช่วงพัง
  const out: string[] = [];
  for (let i = start; i <= end; i++) out.push(prefix + i);
  return out;
}

/**
 * อ่านชีต Serial No. (rows = แถวเป็น array ของค่า cell) → รถรายคันพร้อม SN
 * หา header เอง (คอลัมน์ที่มีคำว่า Serial/Model/PI/QTY)
 */
export function parseStaxxSerialSheet(rows: string[][]): ParsedVehicle[] {
  let hi = rows.findIndex((r) => r.some((c) => /serial|srial/i.test(String(c))));
  if (hi < 0) hi = 0;
  const header = rows[hi].map((c) => String(c ?? "").toLowerCase());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const ci = { model: col(/model|item/), sn: col(/serial|srial/), pi: col(/pi\s*no|^pi/) };
  if (ci.model < 0 || ci.sn < 0) return [];

  const out: ParsedVehicle[] = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const model = String(row[ci.model] ?? "").trim();
    const snRange = String(row[ci.sn] ?? "").trim();
    if (!model || !snRange) continue;
    const pi = ci.pi >= 0 ? String(row[ci.pi] ?? "").trim() || undefined : undefined;
    const kg = staxxCapacityKg(model);
    const isSemi = /^EPS/i.test(model.replace(/\s/g, ""));
    for (const sn of expandSnRange(snRange)) {
      out.push({
        brand: "STAXX", model, SN: sn, capacity_kg: kg,
        fuel: isSemi ? "กึ่งไฟฟ้า" : "มือ",
        vendor: "STAXX", pi_no: pi,
        flags: kg ? undefined : ["ไม่รู้พิกัดจากรุ่น — กรอกเอง"],
      });
    }
  }
  return out;
}
