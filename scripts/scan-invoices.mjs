// scripts/scan-invoices.mjs — สแกนเอกสารใบกำกับ/บิลเงินสดทั้งหมดใน data/ หา SN
// อ่านอย่างเดียว · ไม่แก้ไฟล์ใดๆ
// รัน: node scripts/scan-invoices.mjs [SN1 SN2 ...]   (ไม่ใส่ = สร้างดัชนี SN ทั้งหมด)
import ExcelJS from "exceljs";
import { readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const OUT = join(ROOT, "local-data");

const targets = process.argv.slice(2).map(s => s.toUpperCase());

const cellText = c => {
  const v = c?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map(t => t.text).join("");
    if (v.result !== undefined) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.text) return String(v.text);
    return "";
  }
  return String(v);
};

const walk = dir => readdirSync(dir).flatMap(name => {
  const p = join(dir, name);
  if (statSync(p).isDirectory()) return walk(p);
  return /\.xlsx?$/i.test(name) && !name.startsWith("~$") ? [p] : [];
});

const files = walk(DATA);
console.log(`พบไฟล์ ${files.length} ไฟล์ใน data/`);

const hits = [];        // เจอ SN ที่ตามหา
const snIndex = new Map(); // ดัชนี SN → รายการเอกสาร
let scannedSheets = 0, scannedRows = 0;

for (const file of files) {
  const rel = relative(DATA, file);
  let wb;
  try {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
  } catch (e) {
    console.log(`  ⚠️ อ่านไม่ได้: ${rel} (${e.message})`);
    continue;
  }
  for (const ws of wb.worksheets) {
    scannedSheets++;
    for (let r = 1; r <= ws.rowCount; r++) {
      const cells = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(ws.getRow(r).getCell(c)));
      const line = cells.join(" ").trim();
      if (!line) continue;
      scannedRows++;
      const upper = line.toUpperCase();

      // 1) ค้นแบบเจาะจง SN ที่สั่งมา
      for (const t of targets) {
        if (upper.includes(t)) {
          hits.push({ sn: t, file: rel, sheet: ws.name, row: r, cells: cells.filter(Boolean) });
        }
      }

      // 2) สร้างดัชนี SN ทั่วไป (รูปแบบ "SN : xxxx" ในชื่อสินค้า)
      for (const m of line.matchAll(/SN\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{4,})/g)) {
        const sn = m[1].toUpperCase().replace(/[^A-Z0-9\-]/g, "");
        if (!sn) continue;
        if (!snIndex.has(sn)) snIndex.set(sn, []);
        snIndex.get(sn).push({ file: rel, sheet: ws.name, row: r, line: line.slice(0, 300) });
      }
    }
  }
}

console.log(`สแกน ${scannedSheets} ชีต · ${scannedRows} แถว`);
console.log(`ดัชนี SN ที่พบในเอกสาร: ${snIndex.size} หมายเลข`);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "invoice-sn-index.json"), JSON.stringify(
  Object.fromEntries([...snIndex].map(([k, v]) => [k, v])), null, 2), "utf8");

if (targets.length) {
  console.log(`\n════ ผลค้นหา ${targets.length} SN ════`);
  for (const t of targets) {
    const found = hits.filter(h => h.sn === t);
    if (!found.length) { console.log(`\n❌ ${t} — ไม่พบในเอกสารทั้งหมด`); continue; }
    console.log(`\n✅ ${t} — พบ ${found.length} แห่ง`);
    found.slice(0, 6).forEach(h => {
      console.log(`   📄 ${h.file} › ${h.sheet} แถว ${h.row}`);
      console.log(`      ${h.cells.join(" | ").slice(0, 260)}`);
    });
  }
  writeFileSync(join(OUT, "invoice-search-result.json"), JSON.stringify(hits, null, 2), "utf8");
}
