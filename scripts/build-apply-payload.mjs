// scripts/build-apply-payload.mjs — เฟส 4 (ขั้นเตรียม): ประกอบข้อมูลที่จะเขียนลง Supabase
// ใช้ sync-plan.json (เฟส 3) + การตัดสินใจของผู้ใช้ 27 ก.ค. 2569
// เอาต์พุต: local-data/apply-forklifts.json — แถวเต็มพร้อม upsert (ยังไม่เขียน DB)
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "local-data");
const read = f => JSON.parse(readFileSync(join(DIR, f), "utf8").replace(/^﻿/, ""));

const plan = read("sync-plan.json");
const dbRows = read("db-forklifts.json");
const dbById = new Map(dbRows.map(r => [String(r.id), r]));

// ── การตัดสินใจของผู้ใช้ (27 ก.ค. 2569) ──
// กลุ่ม A (รถเช่าที่ถูก normalize ผิด) + D (Excel ระบุชัด) → ใช้สถานะจาก Excel
// กลุ่ม B (66062-1 ขายแล้ว) + C (รถสั่งผลิตที่ได้ SN แล้ว) + E (พิสูจน์แล้วว่าขายจริง) → คงสถานะเดิมใน DB
const USE_EXCEL_STATUS = new Set([
  // กลุ่ม A — 7 คัน กลับไปเป็น "รถเช่า"
  "010303P4620", "05015DS7940", "010303R6735", "05030DT3168", "010303S9224", "M1BES04894", "66074-47",
  // กลุ่ม D — 5 คัน Excel ระบุลูกค้า/ใบกำกับชัด
  "08015JRK364", "05030DS0320", "05030DT3160", "05030DT5357", "05025DT7251",
]);

const norm = v => String(v ?? "").trim();
const isConflict = u => u.diffs.some(d => d.field === "status" && d.from === "ปิดการขายแล้ว" && d.to !== "ปิดการขายแล้ว");

/** รวม custom_fields — ของเดิมเป็นฐาน แล้วให้ค่าจาก Excel ทับเฉพาะที่มีค่า */
const mergeCf = (dbCf, goldenCf) => {
  const out = { ...(dbCf ?? {}) };
  for (const [k, v] of Object.entries(goldenCf ?? {})) if (norm(v)) out[k] = String(v);
  return Object.keys(out).length ? out : null;
};

const rows = [];
const log = { add: 0, update: 0, keptDbStatus: [], usedExcelStatus: [] };

// ── แถวใหม่ ──
for (const a of plan.add) {
  const g = a.data;
  rows.push({
    id: a.proposed_id,
    SN: g.sn || "",
    brand: norm(g.brand),
    model: norm(g.model),
    capacity: "",
    capacity_kg: norm(g.capacity_kg),
    height: norm(g.height),
    fuel: "",
    cost_price: Number(g.cost_price) || 0,
    stock_price: 0,
    status: norm(g.status),
    created_at: new Date("2026-07-27T00:00:00Z").toISOString(),
    vehicle_category: norm(g.vehicle_category) || null,
    vehicle_group: norm(g.vehicle_group) || null,
    pi_no: norm(g.pi_no),
    location: norm(g.location) || null,
    received_date: norm(g.received_date),
    custom_fields: mergeCf(null, g.custom_fields),
  });
  log.add++;
}

// ── แถวที่ต้องแก้ — เอาแถวเดิมเป็นฐาน แล้วทับเฉพาะฟิลด์ที่ diff ระบุ ──
for (const u of plan.update) {
  const base = dbById.get(String(u.id));
  if (!base) { console.log(`  ⚠️ ไม่พบแถวเดิม id=${u.id} — ข้าม`); continue; }
  const g = u.data;
  const row = { ...base };

  for (const d of u.diffs) {
    if (d.field === "status") continue;                 // จัดการแยกด้านล่าง
    if (d.field === "cost_price") { row.cost_price = Number(g.cost_price) || 0; continue; }
    row[d.field] = norm(g[d.field]);
  }
  // ฟิลด์เสริมที่ Excel มีแต่ DB ยังว่าง
  if (!norm(row.height) && norm(g.height)) row.height = norm(g.height);
  if (!norm(row.capacity_kg) && norm(g.capacity_kg)) row.capacity_kg = norm(g.capacity_kg);
  if (!norm(row.location) && norm(g.location)) row.location = norm(g.location);
  // เติม SN ให้แถวรถสั่งผลิตที่เพิ่งได้ SN
  if (!norm(row.SN) && norm(g.sn)) row.SN = norm(g.sn);
  row.custom_fields = mergeCf(base.custom_fields, g.custom_fields);

  // ── สถานะ: ตามการตัดสินใจ ──
  const statusDiff = u.diffs.find(d => d.field === "status");
  if (statusDiff) {
    if (isConflict(u) && !USE_EXCEL_STATUS.has(norm(u.sn))) {
      row.status = base.status;                          // คงของเดิมใน DB
      log.keptDbStatus.push(`${u.id} (${u.sn}): คง "${base.status}" แทน "${g.status}"`);
    } else {
      row.status = norm(g.status);
      if (isConflict(u)) log.usedExcelStatus.push(`${u.id} (${u.sn}): "${base.status}" → "${g.status}"`);
    }
  }
  rows.push(row);
  log.update++;
}

writeFileSync(join(DIR, "apply-forklifts.json"), JSON.stringify(rows, null, 2), "utf8");

const byStatus = rows.reduce((m, r) => { m[r.status] = (m[r.status] ?? 0) + 1; return m; }, {});
console.log(`✅ เตรียมข้อมูลเสร็จ — ${rows.length} แถว (เพิ่มใหม่ ${log.add} · แก้ไข ${log.update})`);
console.log(`   สถานะหลังนำเข้า: ${JSON.stringify(byStatus)}`);
console.log(`   คงสถานะเดิมใน DB: ${log.keptDbStatus.length} คัน (กลุ่ม B/C/E)`);
console.log(`   เปลี่ยนตาม Excel: ${log.usedExcelStatus.length} คัน (กลุ่ม A/D)`);
log.usedExcelStatus.forEach(s => console.log(`      ${s}`));
console.log(`   ไฟล์: local-data/apply-forklifts.json`);
