// lib/quoteImport/ep.ts — อ่านใบเสนอราคา EP (EP Distribution Thailand)
// รูปแบบ: ตาราง Pos | P.No | Description | QTY | U/P(THB) | Amount
//   · P.No เช่น "3T Electric Forklift/EFL302B3" (รุ่นอยู่หลัง "/")
//   · Description มีสเปก: Capacity/fork length/Lithium Battery/Charger/Mast/tire (มีภาษาจีนนำหน้าแต่ละบรรทัด)
//   · Quote No. เช่น EPZL260808 = รหัสอ้างอิงประจำ EP (ไม่ใช่เลข PI)

import { ParsedVehicle, QuoteParseResult } from "./types";

function toBaht(s?: string): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/[,\s฿]/g, ""));
  return isNaN(n) ? undefined : n;
}

export function parseEp(rawText: string): QuoteParseResult {
  const text = rawText.replace(/\s+/g, " ").trim();

  // ⭐ EP: Quote No. (เช่น EPZL260808) = เลข PI ของแบรนด์นี้เลย (ต่างจาก HELI) → ใช้เป็น pi_no
  const quoteNo = text.match(/Quote\s*No\.?\s*:?\s*([A-Z]{2,}[A-Z0-9-]+)/i)?.[1];
  const date = text.match(/Quote\s*Date\s*:?\s*(\d{4}\/\d{1,2}\/\d{1,2})/i)?.[1];

  // รุ่น: หลัง "/" ต่อจากชนิดรถ (Forklift/Truck/Stacker/...) เช่น "Electric Forklift/EFL302B3"
  const models = [...new Set(
    [...text.matchAll(/(?:Forklift|Truck|Stacker|Pallet|Tractor)\s*\/\s*([A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9-]*)/gi)].map((m) => m[1].toUpperCase()),
  )];
  // fallback: รหัสรุ่น EP ขึ้นต้น E (EFL/EST/EPT...) ถ้าไม่เจอแบบมี "/"
  if (models.length === 0) {
    const m = text.match(/\b(E[A-Z]{1,3}\d{2,4}[A-Z0-9]*)\b/);
    if (m) models.push(m[1].toUpperCase());
  }

  // สเปก (ค่าเดียวต่อใบ — EP ปกติ 1 รุ่น/ใบ)
  const capKg = text.match(/Capacity\s*:?\s*([\d,]+)\s*kg/i)?.[1]?.replace(/,/g, "");
  const fork = text.match(/fork\s*length\s*:?\s*([\d,]+)\s*mm/i)?.[1]?.replace(/,/g, "");
  const mastType = text.match(/Mast\s*:?\s*((?:Triplex|Duplex|Simplex|Standard|Full[- ]?Free|Free)[A-Za-z0-9 .\-]*?)(?=\s*(?:实|Solid|tire|Pneumatic|$))/i)?.[1]?.trim();
  const mastH = text.match(/Mast[^]*?(\d(?:\.\d)?)\s*M\b/i)?.[1];   // 4.5M → 4.5
  const fuel = /electric|lithium|li-?ion/i.test(text) ? "ไฟฟ้า" : /diesel/i.test(text) ? "ดีเซล" : /\b(lpg|gas)\b/i.test(text) ? "แก๊ส" : undefined;

  // ราคาทุน = U/P (ก่อน VAT) = จำนวนเงินตัวแรกที่มีทศนิยม .00 ในเอกสาร
  const cost = toBaht(text.match(/([\d,]{4,}\.\d{2})/)?.[1]);

  const vehicles: ParsedVehicle[] = models.map((model) => {
    const flags: string[] = [];
    if (!cost) flags.push("ไม่พบราคาทุน");
    if (!capKg) flags.push("ไม่พบพิกัดยก");
    return {
      brand: "EP", model,
      capacity: capKg ? `${(Number(capKg) / 1000).toFixed(1)} ตัน` : undefined,
      capacity_kg: capKg || undefined,
      fork_length: fork || undefined,
      height: mastH ? `${Number(mastH).toFixed(2)} ม.` : undefined,
      mast: mastType || (mastH ? `${mastH}M` : undefined),
      fuel,
      cost_price: cost,
      pi_no: quoteNo,            // ⭐ EP: Quote No. = เลข PI เลย
      import_ref: quoteNo,       // เก็บซ้ำใน "รหัสอ้างอิงนำเข้า" ด้วย (ค่าเดียวกัน)
      vendor: "EP",
      flags: flags.length ? flags : undefined,
    };
  });

  if (vehicles.length > 1) {
    vehicles.forEach((v) => (v.flags = [...(v.flags ?? []), "ใบนี้มีหลายรุ่น — ตรวจสเปกแต่ละคัน"]));
  }

  return { vendor: "EP", pi_no: quoteNo, quote_date: date, vehicles, rawText };
}
