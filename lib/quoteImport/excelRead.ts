"use client";
// lib/quoteImport/excelRead.ts — อ่านไฟล์ Excel (.xlsx/.xls) ในเบราว์เซอร์
// ใช้กับ Serial No. List ของ STAXX · lazy-load xlsx (SheetJS)

/** อ่านชีตแรกของ Excel → array of rows (แต่ละแถวเป็น array ของค่า cell เป็น string) */
export async function readExcelRows(file: File): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
}

export const isExcelFile = (name: string) => /\.(xlsx|xls)$/i.test(name);
