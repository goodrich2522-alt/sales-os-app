// lib/quoteImport/index.ts — เดาผู้ผลิตจากข้อความ แล้วส่งให้ parser ของเจ้านั้น

import { parseHeli } from "./heli";
import { parseStaxxSerialSheet } from "./staxx";
import { QuoteParseResult, QuoteVendor } from "./types";

export * from "./types";
export { readPdfText, looksScanned } from "./pdfText";
export { readExcelRows, isExcelFile } from "./excelRead";

/** เดาผู้ผลิตจากคำเฉพาะในเอกสาร */
export function detectVendor(text: string): QuoteVendor {
  if (/HELI\s*SOUTHEAST|HELI\b/i.test(text)) return "HELI";
  if (/NINGBO|STAXX/i.test(text)) return "STAXX";
  if (/cnc-?moving|rockman/i.test(text)) return "ROCKMAN";
  if (/HANGCHA/i.test(text)) return "HANGCHA";
  return "unknown";
}

/** อ่านข้อความใบเสนอราคา (PDF text layer) → รายการรถ */
export function parseQuoteText(text: string): QuoteParseResult {
  const vendor = detectVendor(text);
  switch (vendor) {
    case "HELI":
      return parseHeli(text);
    // STAXX Proforma / ROCKMAN / HANGCHA — ทำในเฟสถัดไป
    default:
      return { vendor, vehicles: [], rawText: text };
  }
}

/** อ่าน Serial No. List (Excel) → รายการรถ STAXX พร้อม SN */
export function parseQuoteExcel(rows: string[][]): QuoteParseResult {
  const vehicles = parseStaxxSerialSheet(rows);
  return { vendor: "STAXX", vehicles, rawText: "" };
}
