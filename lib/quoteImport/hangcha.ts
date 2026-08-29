// lib/quoteImport/hangcha.ts — อ่านใบ HANGCHA Proforma Invoice / Sales Contract (text layer)
// รองรับ 2 ฟอร์แมต:
//  A (ใหม่ 2026): มี label "MODEL NO. 型号 X" · "Serial No. X" เดี่ยว · ราค SUBTOTAL เดียว
//  B (เก่า 2024/25): รุ่นฝังในสเปก (ไม่มี label) · หลายบรรทัด "Serial No. : SN1, SN2, SN3  qty  subtotal 7% vat total" (ราคาต่อกลุ่ม)
// SN จริง แตกเป็นรายคัน · ราคาทุน = SUBTOTAL(ก่อน VAT) ÷ จำนวนคันในกลุ่ม

import { ParsedVehicle, QuoteParseResult } from "./types";

// รุ่น HANGCHA: CPD(ไฟฟ้า)/CPCD(ดีเซล)/CBD/CDD/CQD/CBS/XF ตามด้วยพิกัด เช่น CPD25-XAJ4-I, CBD15-WS
const MODEL_RE = /\b((?:CPCD|CPD|CBD|CDD|CQD|CBS|XF)\d{1,3}[A-Z0-9-]*)/i;
const MODEL_RE_G = /\b((?:CPCD|CPD|CBD|CDD|CQD|CBS|XF)\d{1,3}[A-Z0-9-]*)/gi;
// กลุ่ม serial+ราคา (format B): "Serial No. : SN1 , SN2 , SN3   3   57,000.00 7%"
const GROUP_RE = /Serial No\.?\s*:?\s*([A-Z0-9][A-Z0-9,\s]*?)\s+(\d{1,3})\s+([\d,]+\.\d{2})\s*7\s*%/gi;
// serial เดี่ยว (format A / fallback)
const SN_RE = /Serial No\.?\s*:?\s*([A-Z0-9]{6,})/gi;

export function parseHangcha(rawText: string): QuoteParseResult {
  const text = rawText.replace(/\s+/g, " ").trim();

  const pi_no = text.match(/P\s*\/?\s*I\s*NO\.?\s*:?\s*(HCTH[-\w]+)/i)?.[1];
  const date = text.match(/DATE\s*:?\s*(\d{4}\.\d{2}\.\d{2})/i)?.[1];

  // รุ่น: จับ token รุ่นตัวแรก (ใช้ได้ทั้ง format A ที่มี label และ format B ที่ฝังในสเปก)
  const model = text.match(MODEL_RE)?.[1]?.toUpperCase();
  if (!model) return { vendor: "HANGCHA", pi_no, quote_date: date, vehicles: [], rawText };

  // สเปก (ดึงจากทั้งใบ — ปกติใบละรุ่นเดียว)
  const num = model.match(/\d{1,3}/)?.[0];
  const capacity = num ? `${(Number(num) / 10).toFixed(1)} ตัน`
    : (text.match(/([\d.]+)\s*tons?/i)?.[1] ? `${text.match(/([\d.]+)\s*tons?/i)![1]} ตัน` : undefined);
  const fuel = /diesel/i.test(text) || /^CPCD/i.test(model) ? "ดีเซล"
    : /electric|li-?ion|lithium|battery/i.test(text) || /^C[BPQD]|^XF/i.test(model) ? "ไฟฟ้า"
    : undefined;
  const fork_length = text.match(/Fork length\s*(\d{3,4})\s*mm/i)?.[1];
  const heightM = text.match(/([\d.]+)\s*m\.?\s*(?:Simplex|Duplex|Triplex)?\s*mast/i)?.[1];
  const height = heightM ? `${heightM} ม.` : undefined;
  const mastType = text.match(/(Simplex|Duplex|Triplex)\s*mast/i)?.[1];
  const mast = heightM && mastType ? `${heightM}m ${mastType}` : mastType || undefined;

  const multiModel = new Set([...text.matchAll(MODEL_RE_G)].map((m) => m[1].toUpperCase().replace(/-.*/, ""))).size > 1;

  const build = (sn: string | undefined, unitCost?: number): ParsedVehicle => {
    const flags: string[] = [];
    if (!sn) flags.push("ไม่พบ SN");
    if (!unitCost) flags.push("ไม่พบราคาทุน");
    if (multiModel) flags.push("ใบนี้มีหลายรุ่น — ตรวจจับคู่ SN/รุ่น/ราคาให้ถูก");
    return {
      brand: "HANGCHA", model, SN: sn, capacity, fuel, mast, fork_length, height,
      cost_price: unitCost, pi_no, vendor: "HANGCHA",
      flags: flags.length ? flags : undefined,
    };
  };

  const vehicles: ParsedVehicle[] = [];
  // format B: หลายกลุ่ม serial+qty+ราคา
  const groups = [...text.matchAll(GROUP_RE)];
  if (groups.length) {
    for (const g of groups) {
      const sns = g[1].split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^[A-Z0-9]{6,}$/i.test(s));
      const qty = Number(g[2]) || sns.length || 1;
      const subtotal = Number(g[3].replace(/,/g, "")) || undefined;
      const unit = subtotal ? Math.round(subtotal / Math.max(qty, 1)) : undefined;
      (sns.length ? sns : [undefined]).forEach((sn) => vehicles.push(build(sn, unit)));
    }
  } else {
    // format A: serial เดี่ยว + subtotal เดียว
    const sns = [...new Set([...text.matchAll(SN_RE)].map((m) => m[1]))];
    const subtotal = Number(text.match(/([\d,]+\.\d{2})\s*7\s*%/)?.[1]?.replace(/,/g, "")) || undefined;
    const unit = subtotal ? Math.round(subtotal / Math.max(sns.length, 1)) : undefined;
    (sns.length ? sns : [undefined]).forEach((sn) => vehicles.push(build(sn, unit)));
  }

  return { vendor: "HANGCHA", pi_no, quote_date: date, vehicles, rawText };
}
