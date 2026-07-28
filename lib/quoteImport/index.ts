// lib/quoteImport/index.ts — เดาผู้ผลิตจากข้อความ แล้วส่งให้ parser ของเจ้านั้น

import { parseHeli } from "./heli";
import { QuoteParseResult, QuoteVendor } from "./types";

export * from "./types";
export { readPdfText, looksScanned } from "./pdfText";

/** เดาผู้ผลิตจากคำเฉพาะในเอกสาร */
export function detectVendor(text: string): QuoteVendor {
  if (/HELI\s*SOUTHEAST|HELI\b/i.test(text)) return "HELI";
  if (/NINGBO|STAXX/i.test(text)) return "STAXX";
  if (/cnc-?moving|rockman/i.test(text)) return "ROCKMAN";
  if (/HANGCHA/i.test(text)) return "HANGCHA";
  return "unknown";
}

/** อ่านข้อความใบเสนอราคา → รายการรถ (เลือก parser ตามเจ้า) */
export function parseQuoteText(text: string): QuoteParseResult {
  const vendor = detectVendor(text);
  switch (vendor) {
    case "HELI":
      return parseHeli(text);
    // STAXX / ROCKMAN / HANGCHA — ทำในเฟสถัดไป
    default:
      return { vendor, vehicles: [], rawText: text };
  }
}
