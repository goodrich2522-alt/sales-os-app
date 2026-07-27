// scripts/build-sales-from-invoices.mjs — เฟส 6: ดึงยอดขายจริงจากเอกสารใน data/ มาเติมตาราง sales
// อ่านอย่างเดียว · ผลลัพธ์: local-data/invoice-docs.json + local-data/apply-sales.json + รายงาน
//
// เอกสารที่อ่าน:
//   - รายงานภาษีขายรายเดือน  → ชีต "รายงานใบเสร็จรับเงิน" และ "รายงานใบแจ้งหนี้"
//   - สรุปยอดขายบิลเงินสด    → ชีต "บิลเงินสด"
// ⚠️ หนึ่งเอกสารมีได้หลายแถว (ผ่อนชำระหลายงวด) → รวมเป็นเอกสารเดียวด้วยเลขที่เอกสาร
import ExcelJS from "exceljs";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const DIR = join(ROOT, "local-data");

const cell = c => {
  const v = c?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map(t => t.text).join("");
    if (v.result !== undefined) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.text) return String(v.text);
    return "";
  }
  return String(v).trim();
};
const num = s => Number(String(s ?? "").replace(/[^\d.-]/g, "")) || 0;

/** วันที่ในเอกสารมีทั้ง "01/04/2026" (ค.ศ.) และ "2569-04-01" (พ.ศ.) → ISO ค.ศ. */
const toIso = s => {
  const t = String(s ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) { const y = Number(m[1]); return `${y >= 2400 ? y - 543 : y}-${m[2]}-${m[3]}`; }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) { const y = Number(m[3]); return `${y >= 2400 ? y - 543 : y}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`; }
  return "";
};

/** ดึง SN ทั้งหมดจากข้อความชื่อสินค้า — รองรับ "SN : A,SN : B" และ "SN : A / EN : x" */
const snsFrom = text => {
  const out = [];
  for (const m of String(text ?? "").matchAll(/SN\s*[:：]\s*([A-Za-z0-9][A-Za-z0-9\-]{4,})/g)) {
    const sn = m[1].toUpperCase();
    if (!out.includes(sn)) out.push(sn);
  }
  return out;
};

const walk = d => readdirSync(d).flatMap(nm => {
  const p = join(d, nm);
  if (statSync(p).isDirectory()) return walk(p);
  return /\.xlsx$/i.test(nm) && !nm.startsWith("~$") ? [p] : [];
});

// ── หาตำแหน่งคอลัมน์จาก "ชื่อหัวคอลัมน์" ไม่ใช่เลขคอลัมน์ตายตัว ──
// (จำเป็น: ไฟล์เดือนกรกฎาคมมีคอลัมน์เกินมา ทำให้ตำแหน่งเลื่อนจากเดือนอื่น)
const SHEETS = new Set(["รายงานใบเสร็จรับเงิน", "รายงานใบแจ้งหนี้", "บิลเงินสด"]);

function findLayout(ws) {
  for (let r = 1; r <= Math.min(12, ws.rowCount); r++) {
    const h = [];
    for (let c = 1; c <= ws.columnCount; c++) h[c] = cell(ws.getRow(r).getCell(c)).replace(/\s+/g, "");
    const find = (...names) => { for (let c = 1; c < h.length; c++) if (names.some(n => h[c] === n)) return c; return -1; };
    const doc = find("เลขที่เอกสาร", "เลขที่");
    if (doc < 0) continue;
    return {
      head: r, doc,
      date:  find("วันที่ออก", "วันที่"),
      cust:  find("ชื่อลูกค้า", "บจก."),
      item:  find("ชื่อสินค้า/บริการ", "รายการ"),
      net:   find("ยอดก่อนVAT", "จำนวนเงิน"),
      total: find("ทั้งหมด", "จำนวนเงิน"),
      kind:  find("ประเภทงาน"),
      staff: find("เซลล์ดูแล", "เซลล์"),
    };
  }
  return null;
}

const docs = new Map(); // เลขที่เอกสาร → ข้อมูลเอกสาร
let scanned = 0;

for (const file of walk(DATA)) {
  const rel = relative(DATA, file);
  let wb;
  try { wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file); } catch { continue; }
  for (const ws of wb.worksheets) {
    if (!SHEETS.has(ws.name.trim())) continue;
    const L = findLayout(ws);
    if (!L) { console.log(`  ⚠️ หาหัวคอลัมน์ไม่เจอ: ${rel} › ${ws.name}`); continue; }
    scanned++;
    for (let r = L.head + 1; r <= ws.rowCount; r++) {
      const g = i => (i > 0 ? cell(ws.getRow(r).getCell(i)) : "");
      const doc = g(L.doc).trim();
      if (!doc || /^ลำดับ|^รวม/.test(doc)) continue;
      const item = g(L.item);
      const sns = snsFrom(item);
      const rec = docs.get(doc) ?? {
        doc, date: toIso(g(L.date)), customer: g(L.cust).trim(), item,
        net: num(g(L.net)), total: num(g(L.total)),
        kind: g(L.kind).trim(), staff: g(L.staff).trim(), sns, source: rel, sheet: ws.name.trim(),
      };
      // แถวซ้ำ = งวดผ่อนชำระ → เก็บยอดรวมสูงสุด และเติมช่องที่ว่าง
      rec.net = Math.max(rec.net, num(g(L.net)));
      rec.total = Math.max(rec.total, num(g(L.total)));
      if (!rec.customer) rec.customer = g(L.cust).trim();
      if (!rec.staff) rec.staff = g(L.staff).trim();
      if (!rec.sns.length && sns.length) rec.sns = sns;
      docs.set(doc, rec);
    }
  }
}

const all = [...docs.values()];
writeFileSync(join(DIR, "invoice-docs.json"), JSON.stringify(all, null, 2), "utf8");

const byKind = all.reduce((m, d) => { m[d.kind || "(ไม่ระบุ)"] = (m[d.kind || "(ไม่ระบุ)"] ?? 0) + 1; return m; }, {});
const withSn = all.filter(d => d.sns.length);
console.log(`อ่าน ${scanned} ชีต · เอกสารไม่ซ้ำ ${all.length} ใบ · มี SN ${withSn.length} ใบ`);
console.log(`แยกตามประเภทงาน: ${JSON.stringify(byKind)}`);

// ── จับคู่กับรถในระบบ ──
const rd = f => JSON.parse(readFileSync(join(DIR, f), "utf8").replace(/^﻿/, ""));
const forklifts = rd("db-forklifts-after.json");
const sales = rd("db-sales-after.json");

const fkBySn = new Map();
forklifts.forEach(f => { const sn = String(f.SN ?? "").trim().toUpperCase(); if (sn) (fkBySn.get(sn) ?? fkBySn.set(sn, []).get(sn)).push(f); });
const saleByForklift = new Map(sales.map(s => [String(s.forklift_id ?? ""), s]));

const SALE_KINDS = ["งานขาย"];           // ค่าเช่า/งานซ่อม ไม่นับเป็นการขายรถ
const rows = [], unmatched = [], skipped = [];

for (const d of withSn) {
  if (!SALE_KINDS.includes(d.kind)) { skipped.push(d); continue; }
  const share = d.sns.length;             // เอกสารเดียวขายหลายคัน → เฉลี่ยยอดเท่ากัน
  for (const sn of d.sns) {
    const fks = fkBySn.get(sn);
    if (!fks?.length) { unmatched.push({ doc: d.doc, sn, customer: d.customer }); continue; }
    const fk = fks[0];
    const existing = saleByForklift.get(String(fk.id));
    const amount = Math.round(((d.net || d.total) / share) * 100) / 100;
    rows.push({
      id: existing?.id ?? `sale_${d.doc}_${sn}`,
      forklift_id: fk.id,
      forklift_unit_no: sn,
      forklift_brand: fk.brand ?? "",
      forklift_model: fk.model ?? "",
      customer_name: d.customer || existing?.customer_name || "",
      customer_tel: existing?.customer_tel ?? "",
      customer_type: existing?.customer_type ?? null,
      province: existing?.province ?? "",
      sales_staff: d.staff || existing?.sales_staff || "",
      payment_type: /^CH/i.test(d.doc) ? "เงินสด" : (existing?.payment_type ?? null),
      actual_sale: amount,
      deposit: existing?.deposit ?? 0,
      delivery_date: d.date,
      sale_status: "ขายแล้ว",
      sale_type: "รถขายเต็มคัน",
      created_at: existing?.created_at ?? `${d.date}T00:00:00.000Z`,
      remark: existing?.remark ?? "",
      custom_fields: {
        ...(existing?.custom_fields ?? {}),
        "เลขที่เอกสาร": d.doc,
        "ยอดรวม VAT": String(d.total || ""),
        "แหล่งข้อมูล": d.source,
        ...(share > 1 ? { "หมายเหตุ": `เอกสารนี้ขาย ${share} คัน — เฉลี่ยยอดเท่ากัน` } : {}),
      },
    });
  }
}

// เอกสารเดียวอาจซ้ำรถคันเดิม → เก็บยอดสูงสุด
const byId = new Map();
for (const r of rows) {
  const prev = byId.get(r.id);
  if (!prev || r.actual_sale > prev.actual_sale) byId.set(r.id, r);
}
const final = [...byId.values()];

writeFileSync(join(DIR, "apply-sales.json"), JSON.stringify(final, null, 2), "utf8");

const sum = final.reduce((s, r) => s + r.actual_sale, 0);
const updates = final.filter(r => saleByForklift.has(String(r.forklift_id))).length;
console.log(`\n✅ เตรียมข้อมูลขาย ${final.length} รายการ (อัปเดตของเดิม ${updates} · เพิ่มใหม่ ${final.length - updates})`);
console.log(`   ยอดขายรวม ${Math.round(sum).toLocaleString()} บาท`);
console.log(`   ข้ามเพราะไม่ใช่งานขาย ${skipped.length} ใบ (${[...new Set(skipped.map(d => d.kind))].join(", ") || "-"})`);
console.log(`   หา SN ในระบบไม่เจอ ${unmatched.length} รายการ`);
if (unmatched.length) console.log(`      เช่น ${unmatched.slice(0, 8).map(u => u.sn).join(", ")}`);
