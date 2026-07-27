// scripts/build-diff.mjs — เฟส 3: เทียบ golden dataset กับ Supabase (อ่านอย่างเดียว)
// อินพุต : local-data/golden-stock.json · local-data/db-forklifts.json · local-data/db-sales.json
// เอาต์พุต: local-data/sync-diff.md (ให้คนอ่าน) · local-data/sync-plan.json (ให้เฟส 4 ใช้)
// ไม่เขียน DB · ไม่แก้ Excel
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "local-data");
// ตัด BOM ออกก่อน — ไฟล์ที่ดึงมาด้วย PowerShell มี BOM นำหน้า
const read = f => JSON.parse(readFileSync(join(DIR, f), "utf8").replace(/^﻿/, ""));

const golden = read("golden-stock.json").units;
const dbForklifts = read("db-forklifts.json");
const dbSales = read("db-sales.json");

const norm = v => String(v ?? "").trim();
const upper = v => norm(v).toUpperCase();
const num = v => Number(v ?? 0) || 0;

// ── ฟิลด์ที่เทียบ (custom_fields ถือเป็น "ข้อมูลเสริม" ไม่นับเป็นความต่างถ้า DB ว่าง) ──
const CORE = [
  { key: "status",           label: "สถานะ" },
  { key: "cost_price",       label: "ราคาทุน",   isNum: true },
  { key: "received_date",    label: "วันรับรถ" },
  { key: "brand",            label: "ยี่ห้อ" },
  { key: "model",            label: "รุ่น" },
  { key: "vehicle_category", label: "ประเภทรถ" },
  { key: "vehicle_group",    label: "กลุ่มรถ" },
  { key: "pi_no",            label: "เลข PI" },
];

// ── ดัชนีฝั่ง DB ──
const dbBySn = new Map();
const dbNoSn = [];
for (const r of dbForklifts) {
  const sn = upper(r.SN);
  if (!sn) { dbNoSn.push(r); continue; }
  if (!dbBySn.has(sn)) dbBySn.set(sn, []);
  dbBySn.get(sn).push(r);
}

// ── ดีลที่ผูกกับรถ ──
const salesByForkliftId = new Map();
for (const s of dbSales) {
  const fid = norm(s.forklift_id);
  if (!fid) continue;
  if (!salesByForkliftId.has(fid)) salesByForkliftId.set(fid, []);
  salesByForkliftId.get(fid).push(s);
}
const dbIds = new Set(dbForklifts.map(r => norm(r.id)));
const orphanSales = dbSales.filter(s => norm(s.forklift_id) && !dbIds.has(norm(s.forklift_id)));

// ── รหัสรถสำหรับแถวใหม่ ──
// กติกา: ถ้า `FK-<SN>` ถูกดีลกำพร้าอ้างถึงอยู่ → ต้องใช้รหัสนั้น (ไม่งั้นดีลผูกกลับไม่ได้)
//        นอกนั้นใช้รหัสสินค้าอัตโนมัติตามไลน์สินค้า (FK/ST/HL-0001) ตามคอนเวนชันของแอป
//        — กันไม่ให้ SN ที่เป็นตัวเลขล้วน (เช่นชีตเจนบรรเจิด) ไปดันเลขรันของรหัสสินค้าให้กระโดด
const orphanRefIds = new Set(
  dbSales.map(s => norm(s.forklift_id)).filter(id => id && !dbIds.has(id))
);
const CAT_PREFIX = { Forklift: "FK", Stacker: "ST", Handlift: "HL" };
const seq = { FK: 0, ST: 0, HL: 0 };
// เริ่มนับต่อจากเลขสูงสุดที่มีอยู่ใน DB
for (const r of dbForklifts) {
  const m = /^(FK|ST|HL)-(\d{4,6})$/.exec(norm(r.id));
  if (m) seq[m[1]] = Math.max(seq[m[1]], Number(m[2]));
}
const assignId = u => {
  if (u.sn && orphanRefIds.has(`FK-${u.sn}`)) return `FK-${u.sn}`;
  const p = CAT_PREFIX[u.vehicle_category] ?? "FK";
  seq[p] += 1;
  return `${p}-${String(seq[p]).padStart(4, "0")}`;
};

// ── จัดกลุ่ม ──
const toAdd = [], toUpdate = [], enrichOnly = [], same = [], toReview = [];
const usedDbRows = new Set();

// golden ที่มี SN — จับคู่ทีละตัว (SN ซ้ำโดยตั้งใจจับคู่ตามลำดับ)
const goldenBySn = new Map();
for (const u of golden) {
  if (!u.sn) continue;
  const sn = upper(u.sn);
  if (!goldenBySn.has(sn)) goldenBySn.set(sn, []);
  goldenBySn.get(sn).push(u);
}

for (const [sn, gList] of goldenBySn) {
  const dList = dbBySn.get(sn) ?? [];
  gList.forEach((g, i) => {
    const d = dList[i];
    if (!d) {
      toAdd.push({ golden: g, proposed_id: assignId(g), reason: dList.length ? `SN ซ้ำ — DB มี ${dList.length} แถว แต่ Excel มี ${gList.length}` : "ไม่มีใน DB" });
      return;
    }
    usedDbRows.add(d);
    const diffs = [];
    for (const f of CORE) {
      const gv = f.isNum ? num(g[f.key]) : norm(g[f.key]);
      const dv = f.isNum ? num(d[f.key]) : norm(d[f.key]);
      if (String(gv) !== String(dv)) diffs.push({ field: f.key, label: f.label, from: dv === "" || dv === 0 ? "(ว่าง)" : String(dv), to: gv === "" || gv === 0 ? "(ว่าง)" : String(gv) });
    }
    // ข้อมูลเสริมที่ DB ยังไม่มี
    const cfAdd = [];
    for (const [k, v] of Object.entries(g.custom_fields ?? {})) {
      const cur = norm((d.custom_fields ?? {})[k]);
      if (!cur && v) cfAdd.push(k);
    }
    const linkedSales = salesByForkliftId.get(norm(d.id)) ?? [];
    if (diffs.length) {
      toUpdate.push({ golden: g, db: d, diffs, cfAdd, linkedSales });          // ข้อมูลหลักไม่ตรง
    } else if (cfAdd.length) {
      enrichOnly.push({ golden: g, db: d, diffs, cfAdd, linkedSales });        // ตรงแล้ว แค่เติมข้อมูลเสริม
    } else {
      same.push({ golden: g, db: d });
    }
  });
}

// ── golden ที่ยังไม่มี SN (รถสั่งผลิต) ──
// DB มีแถวรถรอรับที่ไม่มี SN อยู่แล้ว (id ขึ้นต้น FK-WAIT-) → ต้องจับคู่ ไม่ใช่เพิ่มซ้ำ
// จับคู่ด้วย เลข PI + รุ่น + ราคาทุน (SN ยังไม่มี ใช้เป็นคีย์ไม่ได้)
const orderKey = (pi, model, cost) => `${norm(pi).replace(/[-\s]/g, "").toUpperCase()}|${upper(model)}|${num(cost)}`;
const dbNoSnPool = new Map();
for (const r of dbNoSn) {
  const k = orderKey(r.pi_no, r.model, r.cost_price);
  if (!dbNoSnPool.has(k)) dbNoSnPool.set(k, []);
  dbNoSnPool.get(k).push(r);
}
const matchedWait = [];
for (const g of golden) {
  if (g.sn) continue;
  const pool = dbNoSnPool.get(orderKey(g.pi_no, g.model, g.cost_price)) ?? [];
  const d = pool.shift();
  if (!d) {
    toAdd.push({ golden: g, proposed_id: assignId(g), reason: "รถสั่งผลิต ยังไม่มี SN — ยังไม่มีแถวใน DB" });
    continue;
  }
  usedDbRows.add(d);
  const diffs = [];
  for (const f of CORE) {
    const gv = f.isNum ? num(g[f.key]) : norm(g[f.key]);
    const dv = f.isNum ? num(d[f.key]) : norm(d[f.key]);
    if (String(gv) !== String(dv)) diffs.push({ field: f.key, label: f.label, from: dv === "" || dv === 0 ? "(ว่าง)" : String(dv), to: gv === "" || gv === 0 ? "(ว่าง)" : String(gv) });
  }
  const cfAdd = Object.entries(g.custom_fields ?? {}).filter(([k, v]) => v && !norm((d.custom_fields ?? {})[k])).map(([k]) => k);
  const linkedSales = salesByForkliftId.get(norm(d.id)) ?? [];
  matchedWait.push({ golden: g, db: d, diffs, cfAdd, linkedSales });
  if (diffs.length) toUpdate.push({ golden: g, db: d, diffs, cfAdd, linkedSales });
  else if (cfAdd.length) enrichOnly.push({ golden: g, db: d, diffs, cfAdd, linkedSales });
  else same.push({ golden: g, db: d });
}

// แถวใน DB ที่ golden ไม่มี → ต้องตรวจ
for (const d of dbForklifts) {
  if (usedDbRows.has(d)) continue;
  const linkedSales = salesByForkliftId.get(norm(d.id)) ?? [];
  toReview.push({ db: d, linkedSales });
}

// ── ตรวจว่าดีลกำพร้าจะกลับมาผูกได้กี่รายการ ──
const idsAfterImport = new Set([...dbIds, ...toAdd.map(a => a.proposed_id).filter(Boolean)]);
const orphanFixed = orphanSales.filter(s => idsAfterImport.has(norm(s.forklift_id)));
const orphanLeft = orphanSales.filter(s => !idsAfterImport.has(norm(s.forklift_id)));

// ── ผลข้างเคียงกับรหัสสินค้าอัตโนมัติ (generateProductId หาเลขสูงสุดของ FK-\d{4,}) ──
const productIdRe = /^(FK|ST|HL)-(\d{4,})$/;
const maxNow = Math.max(0, ...dbForklifts.map(r => productIdRe.exec(norm(r.id))?.[2]).filter(Boolean).map(Number));
const maxAfter = Math.max(maxNow, ...toAdd.map(a => productIdRe.exec(norm(a.proposed_id ?? ""))?.[2]).filter(Boolean).map(Number));

// ── กรณีเสี่ยง: DB บอกขายแล้ว แต่ Excel บอกยังไม่ขาย ──
const soldInDbOnly = toUpdate.filter(u =>
  norm(u.db.status) === "ปิดการขายแล้ว" && norm(u.golden.status) !== "ปิดการขายแล้ว");
// ⚠️ ดีลใน DB เกือบทั้งหมดเป็น "ของนำเข้า" ไม่ใช่ดีลจริง (ยอดขาย = 0 · ไม่มีชื่อเซลล์)
// จึงใช้เป็นหลักฐานยืนยันการขายไม่ได้ — แยกให้ชัดว่าอันไหนสร้างจากแอปจริง
const IMPORT_CUTOFF = "2026-06-18";
const isRealDeal = s => norm(s.created_at) >= IMPORT_CUTOFF && (num(s.actual_sale) > 0 || norm(s.sales_staff));
const realDeals = dbSales.filter(isRealDeal);
const importedDeals = dbSales.filter(s => !isRealDeal(s));
const soldWithDeal = soldInDbOnly.filter(u => u.linkedSales.some(isRealDeal));
const soldNoDeal   = soldInDbOnly.filter(u => !u.linkedSales.some(isRealDeal));

// ── สืบที่มาของสถานะใน DB จากไฟล์ backup ตอน normalize 13 ก.ค. ──
// ไฟล์นี้เก็บ old_status → new_status ไว้ ใช้พิสูจน์ได้ว่าสถานะ "ปิดการขายแล้ว" มาจากไหน
let backupRows = [];
try { backupRows = JSON.parse(readFileSync(join(ROOT, "status-backup-2026-07-13.json"), "utf8")).rows ?? []; } catch { /* ไม่มีไฟล์ก็ข้าม */ }
const oldStatusOf = sn => backupRows.find(r => upper(r.unit_no) === upper(sn))?.old_status ?? "";

const CONFLICT_GROUPS = [
  { id: "A", title: "DB ผิดชัดเจน — เดิมเป็น **รถเช่า** แต่ถูก normalize เป็นขายแล้ว", verdict: "✅ เชื่อ Excel", test: (u, old) => /เช่า/.test(old) },
  { id: "B", title: "DB ผิดชัดเจน — เดิมเป็น **พร้อมขาย** หรือค่าวันที่ แต่ถูก normalize เป็นขายแล้ว", verdict: "✅ เชื่อ Excel", test: (u, old) => old === "พร้อมขาย" || /^\d{4}-/.test(old) },
  { id: "C", title: "รถสั่งผลิตที่เติม SN จากแอป — แอปรู้ว่ารถมาถึงแล้ว Excel ยังค้างที่ตอนสั่ง", verdict: "⚠️ เสนอเชื่อ DB (คงสถานะเดิม) แต่เอา PI/ลูกค้า/ทุน จาก Excel", test: u => norm(u.golden.status) === "สั่งผลิต" },
  { id: "D", title: "Excel ระบุชัด (มีชื่อลูกค้า/เลขใบกำกับ) — Excel ใหม่กว่า", verdict: "✅ เชื่อ Excel", test: u => !!(u.golden.custom_fields?.["รายละเอียด (ลูกค้า)"] || u.golden.custom_fields?.["เลขที่ใบกำกับภาษี"]) },
  { id: "E", title: "Excel ว่างเปล่าทั้งแถว (ไม่มีสถานะ/ลูกค้า/ใบกำกับ) — DB เคยมี \"ขายแล้ว\" จาก Excel เวอร์ชันเก่ากว่า", verdict: "❓ ต้องให้ทีมเคาะ — Excel ไม่ได้บอกว่า \"ยังไม่ขาย\" แต่ \"ไม่ได้บอกอะไรเลย\"", test: () => true },
];
const conflictByGroup = new Map(CONFLICT_GROUPS.map(g => [g.id, []]));
for (const u of soldInDbOnly) {
  const old = oldStatusOf(u.golden.sn);
  const grp = CONFLICT_GROUPS.find(g => g.test(u, old));
  conflictByGroup.get(grp.id).push({ u, old });
}

// ── สรุปความต่างรายฟิลด์ ──
const fieldStats = {};
toUpdate.forEach(u => u.diffs.forEach(d => { fieldStats[d.label] = (fieldStats[d.label] ?? 0) + 1; }));

// ── เขียนแผนให้เฟส 4 ──
writeFileSync(join(DIR, "sync-plan.json"), JSON.stringify({
  built_at: new Date().toISOString().slice(0, 10),
  note: "แผนสำหรับเฟส 4 — ยังไม่ได้เขียน DB",
  summary: { add: toAdd.length, update: toUpdate.length, enrich_only: enrichOnly.length, same: same.length, review: toReview.length },
  add: toAdd.map(a => ({ proposed_id: a.proposed_id, sn: a.golden.sn, source: a.golden.source, reason: a.reason, data: a.golden })),
  update: [...toUpdate, ...enrichOnly].map(u => ({ id: u.db.id, sn: u.golden.sn, source: u.golden.source, diffs: u.diffs, custom_fields_to_add: u.cfAdd, linked_sales: u.linkedSales.length, data: u.golden })),
  review: toReview.map(r => ({ id: r.db.id, sn: r.db.SN, model: r.db.model, status: r.db.status, linked_sales: r.linkedSales.length })),
}, null, 2), "utf8");

// ── รายงานให้คนอ่าน ──
const money = n => Number(n).toLocaleString();
const esc = s => String(s ?? "").replace(/\|/g, "/");

const addBySheet = {};
toAdd.forEach(a => { const k = a.golden.sheet; addBySheet[k] = (addBySheet[k] ?? 0) + 1; });
const addCost = toAdd.reduce((s, a) => s + num(a.golden.cost_price), 0);

const md = `# sync-diff.md — รายงานส่วนต่าง golden ↔ Supabase (เฟส 3)

> สร้างเมื่อ ${new Date().toISOString().slice(0, 10)} · **อ่านอย่างเดียว ยังไม่แตะฐานข้อมูล**
> เทียบ \`golden-stock.json\` (${golden.length} คัน จาก Excel) กับ \`forklifts\` บน Supabase (${dbForklifts.length} แถว)
> ต้องได้รับอนุมัติจากผู้ใช้ก่อนจึงจะทำเฟส 4 ได้

## สรุป

| กลุ่ม | จำนวน | ความหมาย |
|---|---|---|
| 🟢 **เพิ่มใหม่** | **${toAdd.length}** | มีใน Excel แต่ยังไม่มีใน DB |
| 🟡 **แก้ไขข้อมูลหลัก** | **${toUpdate.length}** | สถานะ/ราคาทุน/วันที่/ยี่ห้อ ไม่ตรงกัน |
| 🔷 **เติมข้อมูลเสริม** | ${enrichOnly.length} | ข้อมูลหลักตรงแล้ว แค่เติม MAST/Valve/ลูกค้า/เซลล์ ที่ DB ยังไม่มี |
| ⚪ **ตรงกันสนิท** | ${same.length} | ไม่ต้องทำอะไร |
| 🔵 **ต้องตรวจ** | ${toReview.length} | มีใน DB แต่ไม่มีใน Excel |

- มูลค่าทุนของรถที่จะเพิ่มใหม่: **${money(addCost)} บาท**
- หลังนำเข้า ตาราง \`forklifts\` จะมี **${dbForklifts.length + toAdd.length} คัน**

### รถที่จะเพิ่มใหม่ แยกตามชีต
${Object.entries(addBySheet).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: **${v}** คัน`).join("\n")}

## 🔎 ความจริงเกี่ยวกับตาราง \`sales\` (พบระหว่างทำเฟส 3)

| ที่มา | จำนวน | ยอดขายรวม | มีชื่อเซลล์ |
|---|---|---|---|
| นำเข้าเป็นก้อนเมื่อ 17 มิ.ย. | **${importedDeals.length}** | **0 บาท** | 0 รายการ |
| สร้างจากแอปจริง | ${realDeals.length} | (ข้อมูลทดสอบ) | ${realDeals.filter(s => norm(s.sales_staff)).length} |

**แปลว่าตาราง \`sales\` ยังไม่มีข้อมูลการขายจริงเลย** — ทั้ง ${importedDeals.length} รายการถูกแปลงมาจากช่อง "รายละเอียด" ของ Excel โดยตรง
จนบางรายการมีชื่อลูกค้าเป็น \`GR-176\` (เลขสัญญาเช่า) หรือ \`รอรับกลับ\` (คำบอกสถานะ) และทุกรายการมี \`actual_sale = 0\`

**ผลต่อแผน:**
- ดีลกำพร้า ${orphanSales.length} รายการจะกลับมาผูกได้ **${orphanFixed.length} รายการ**${orphanLeft.length ? ` (เหลือค้าง ${orphanLeft.length})` : " ครบทุกรายการ"} — แต่ได้แค่ความสัมพันธ์รถ↔ลูกค้า **ไม่ได้ยอดขาย**
- **รายงานกำไร/ยอดขายยังทำไม่ได้จนกว่าจะมียอดขายจริง** — ต้องคุยแยกว่าจะกรอกย้อนหลังหรือเริ่มนับจากนี้ไป

${orphanLeft.length ? `เหลือค้าง:\n${orphanLeft.map(s => `- \`${s.forklift_id}\` — ${esc(s.customer_name)}`).join("\n")}` : ""}

## 🟡 รายละเอียดการแก้ไข (${toUpdate.length} คัน)

ความต่างแยกตามฟิลด์:

| ฟิลด์ | จำนวนคันที่ต่าง |
|---|---|
${Object.entries(fieldStats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join("\n")}

### ⚠️ คันที่มีดีลผูกอยู่ (แก้แล้วกระทบยอดขาย — ควรดูก่อน)

${(() => {
  const withSales = toUpdate.filter(u => u.linkedSales.length > 0);
  if (!withSales.length) return "- ไม่มี — คันที่ต้องแก้ทั้งหมดยังไม่มีดีลผูก";
  return `รวม **${withSales.length} คัน**\n\n| รหัสรถ | SN | เปลี่ยนอะไร | ดีลที่ผูก |\n|---|---|---|---|\n` +
    withSales.slice(0, 40).map(u => `| ${u.db.id} | ${u.golden.sn} | ${u.diffs.map(d => `${d.label}: ${esc(d.from)} → ${esc(d.to)}`).join(" · ") || "(เพิ่มข้อมูลเสริม)"} | ${u.linkedSales.map(s => esc(s.customer_name)).join(", ")} |`).join("\n") +
    (withSales.length > 40 ? `\n\n_(แสดง 40 จาก ${withSales.length} — ดูครบใน sync-plan.json)_` : "");
})()}

### ตัวอย่างการแก้ที่ไม่มีดีลผูก (20 คันแรก)

| รหัสรถ | SN | เปลี่ยนอะไร |
|---|---|---|
${toUpdate.filter(u => !u.linkedSales.length).slice(0, 20).map(u => `| ${u.db.id} | ${u.golden.sn} | ${u.diffs.map(d => `${d.label}: ${esc(d.from)} → ${esc(d.to)}`).join(" · ") || "(เพิ่มข้อมูลเสริม " + u.cfAdd.length + " ช่อง)"} |`).join("\n")}

## 🔵 ต้องตรวจ — มีใน DB แต่ไม่มีใน Excel (${toReview.length} รายการ)

| รหัสรถ | SN | รุ่น | สถานะใน DB | ดีลที่ผูก | เสนอ |
|---|---|---|---|---|---|
${toReview.map(r => {
  const isTest = /^[ก-๙]{1,3}$/.test(norm(r.db.SN)) || norm(r.db.model).length <= 2;
  return `| ${r.db.id} | ${esc(r.db.SN) || "(ว่าง)"} | ${esc(r.db.model) || "(ว่าง)"} | ${esc(r.db.status)} | ${r.linkedSales.length} | ${isTest ? "**ลบ (ข้อมูลทดสอบ)**" : "เก็บไว้ + ให้ทีมยืนยัน"} |`;
}).join("\n")}

## ⚠️ กรณีขัดแย้ง — DB บอก "ขายแล้ว" แต่ Excel บอกยังไม่ขาย (${soldInDbOnly.length} คัน)

**นี่คือจุดเสี่ยงที่สุดของงานนี้** — ถ้าเอา Excel ทับตรงๆ จะเท่ากับ "ยกเลิกการขาย" ${soldInDbOnly.length} คันโดยไม่ตั้งใจ

**หมายเหตุสำคัญ:** เดิมตั้งใจใช้ "มีดีลผูกอยู่" เป็นหลักฐานว่าขายจริง **แต่ใช้ไม่ได้** — ดีล ${importedDeals.length} จาก ${dbSales.length} รายการเป็นของนำเข้าเมื่อ 17 มิ.ย. ทั้งหมด (ยอดขาย = 0 · ไม่มีชื่อเซลล์ · ชื่อลูกค้าคัดลอกมาจากช่องรายละเอียดของ Excel ตรงๆ จนบางรายการเป็น "GR-176" หรือ "รอรับกลับ")
ดีลที่สร้างจากแอปจริงมีแค่ **${realDeals.length} รายการ** และเป็นข้อมูลทดสอบทั้งหมด

| กลุ่ม | จำนวน | เสนอ |
|---|---|---|
| มีดีลจริงจากแอปผูกอยู่ | **${soldWithDeal.length}** | เชื่อ DB — ไม่เปลี่ยนสถานะ |
| ไม่มีดีลจริง | **${soldNoDeal.length}** | **เชื่อ Excel** ตามหลักการที่ตกลงไว้ |

### กลุ่มที่มีดีลจริงผูกอยู่ (${soldWithDeal.length} คัน)

${soldWithDeal.length ? `| รหัสรถ | SN | DB | Excel | ลูกค้าในดีล |\n|---|---|---|---|---|\n${soldWithDeal.map(u => `| ${u.db.id} | ${esc(u.golden.sn)} | ${esc(u.db.status)} | ${esc(u.golden.status)} | ${u.linkedSales.filter(isRealDeal).map(s => esc(s.customer_name)).join(", ")} |`).join("\n")}` : "- ไม่มี"}

### 🔬 สืบที่มา — แยก ${soldInDbOnly.length} คันตามหลักฐานจาก \`status-backup-2026-07-13.json\`

ไฟล์ backup ตอน normalize สถานะเมื่อ 13 ก.ค. บันทึก \`old_status → new_status\` ไว้ ทำให้พิสูจน์ได้ว่าสถานะ "ปิดการขายแล้ว" ในแต่ละคันมาจากไหน
**พบว่าการ normalize ครั้งนั้นมีบั๊ก** — แปลง \`รถเช่า\`/\`เช่า\`/\`รถเช่า GR-197\` (7 แถว) และ \`พร้อมขาย\` (3 แถว) ไปเป็น \`ปิดการขายแล้ว\` ทั้งหมด

${CONFLICT_GROUPS.map(g => {
  const list = conflictByGroup.get(g.id);
  if (!list.length) return "";
  return `#### กลุ่ม ${g.id} — ${g.title} (${list.length} คัน)\n\n**${g.verdict}**\n\n| SN | สถานะเดิมใน DB (ก่อน 13 ก.ค.) | Excel ว่าอย่างไร | แถว |\n|---|---|---|---|\n` +
    list.map(({ u, old }) => `| ${esc(u.golden.sn)} | ${esc(old) || "(ไม่ถูกแก้ครั้งนั้น)"} | ${esc(u.golden.status)} | ${esc(u.golden.source)} |`).join("\n");
}).filter(Boolean).join("\n\n")}

## ⚙️ เรื่องที่ต้องเคาะก่อนเฟส 4

1. **รหัสรถของแถวใหม่ใช้ \`FK-<SN>\`** — จำเป็น เพราะดีลกำพร้า ${orphanSales.length} รายการอ้างอิงรูปแบบนี้ ถ้าใช้แบบอื่นจะผูกกลับไม่ได้
2. **รถที่เหลือใช้รหัสสินค้าอัตโนมัติตามไลน์สินค้า** — \`FK-0001\` / \`ST-0001\` / \`HL-0001\` ตามคอนเวนชันของแอป
   - ทำแบบนี้เพื่อกันไม่ให้ SN ที่เป็นตัวเลขล้วน (เช่นชีตเจนบรรเจิด \`5410715\`) ไปดันเลขรันของรหัสสินค้าให้กระโดดเป็นหลักล้าน
   - รหัสสูงสุดหลังนำเข้า: ${Object.entries(seq).map(([p, n]) => `\`${p}-${String(n).padStart(4, "0")}\``).join(" · ")}
3. **ต้องเพิ่มสถานะใหม่ใน \`fieldConfig\` ก่อนนำเข้า** — \`สั่งผลิต\` · \`รถเช่า\` · \`เคลม/รับกลับ\` (ไม่งั้นแอปไม่รู้จักค่า)
4. **ควรทำเฟส A (เปลี่ยน \`unit_no\` → \`SN\`) ก่อน** ตาม ROADMAP — ไม่งั้นนำเข้าไปแล้วทีมยังบันทึกงานต่อไม่ได้

## ขั้นตอนเฟส 4 (หลังอนุมัติ)

1. Backup ตาราง \`forklifts\` + \`sales\` (ยังไม่เคยทำ — เฟส 0 ข้ามไป)
2. เพิ่มสถานะใหม่ใน \`app_config.fieldConfig\`
3. Insert ${toAdd.length} คัน (แบ่งเป็นชุดละ ~50)
4. Update ${toUpdate.length} คัน (เฉพาะฟิลด์ที่ระบุ ไม่ทับฟิลด์อื่น)
5. จัดการ ${toReview.length} รายการกลุ่มต้องตรวจ
6. ตรวจรับ: นับแถว · เช็คดีลกำพร้าเหลือ 0 · สุ่มเทียบ 20 SN
`;

writeFileSync(join(DIR, "sync-diff.md"), md, "utf8");

console.log(`✅ เทียบเสร็จ — เพิ่ม ${toAdd.length} · แก้ข้อมูลหลัก ${toUpdate.length} · เติมข้อมูลเสริม ${enrichOnly.length} · ตรงกันสนิท ${same.length} · ต้องตรวจ ${toReview.length}`);
console.log(`   ดีลกำพร้า ${orphanSales.length} → จะผูกกลับได้ ${orphanFixed.length} เหลือค้าง ${orphanLeft.length}`);
console.log(`   ความต่างรายฟิลด์: ${JSON.stringify(fieldStats)}`);
console.log(`   รหัสใหม่: ${Object.entries(seq).map(([p, n]) => `${p} ถึง ${n}`).join(" · ")}`);
console.log(`   ⚠️ DB=ขายแล้ว แต่ Excel=ยังไม่ขาย: ${soldInDbOnly.length} คัน`);
soldInDbOnly.slice(0, 12).forEach(u => console.log(`      ${u.db.id} SN=${u.golden.sn} | DB=${u.db.status} → Excel=${u.golden.status} | ดีลผูก=${u.linkedSales.length}`));
