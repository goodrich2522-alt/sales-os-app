// scripts/import-to-supabase.mjs — เฟส 4: นำเข้าข้อมูลรถลง Supabase
// อ่าน local-data/apply-forklifts.json แล้ว upsert ผ่าน REST API ทีละชุด
//
// ⚠️ สคริปต์นี้ "เขียน" ฐานข้อมูลจริง — รันเมื่อได้รับอนุมัติแล้วเท่านั้น
// สำรองข้อมูลไว้ที่ local-data/backup-2026-07-27_1343/ เรียบร้อยแล้ว
//
// รัน:  node scripts/import-to-supabase.mjs [ตาราง] [ไฟล์]   ค่าเริ่มต้น = forklifts apply-forklifts.json
//       เติม --dry เพื่อทดสอบโดยไม่เขียนจริง
//   เช่น node scripts/import-to-supabase.mjs sales apply-sales.json
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "local-data");
const DRY = process.argv.includes("--dry");

// ต้องตั้ง env ก่อนรัน (repo นี้เป็น public — ห้าม commit คีย์ลงไฟล์)
//   SUPABASE_URL = https://<project>.supabase.co
//   SUPABASE_KEY = publishable key ของโปรเจกต์
const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!BASE || !KEY) {
  console.error("ต้องตั้ง SUPABASE_URL และ SUPABASE_KEY ก่อนรัน");
  process.exit(1);
}
const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const TABLE = args[0] ?? "forklifts";
const FILE = args[1] ?? "apply-forklifts.json";
const URL = `${BASE.replace(/\/$/, "")}/rest/v1/${TABLE}`;
const BATCH = 100;

// PostgREST บังคับว่าทุกอ็อบเจกต์ในชุดเดียวกันต้องมีคีย์ชุดเดียวกันเป๊ะ
// → ปรับทุกแถวให้มีคอลัมน์ครบชุดเท่ากัน (ที่ไม่มีให้เป็น null)
const raw = JSON.parse(readFileSync(join(DIR, FILE), "utf8"));
// ใช้ union ของคีย์ทั้งหมดในไฟล์ เพื่อให้ทุกแถวมีชุดคีย์เท่ากัน
const COLS = [...new Set(raw.flatMap(Object.keys))];
const rows = raw.map(r => Object.fromEntries(COLS.map(c => [c, r[c] ?? null])));
console.log(`เตรียมนำเข้า ${rows.length} แถว → ตาราง ${TABLE} · ชุดละ ${BATCH}${DRY ? "  [โหมดทดสอบ ไม่เขียนจริง]" : ""}`);

let ok = 0;
const fails = [];

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const label = `ชุด ${Math.floor(i / BATCH) + 1}/${Math.ceil(rows.length / BATCH)} (${chunk.length} แถว)`;
  if (DRY) { console.log(`  ${label} — ข้าม (โหมดทดสอบ)`); ok += chunk.length; continue; }
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    ok += chunk.length;
    console.log(`  ✓ ${label}`);
  } catch (e) {
    fails.push({ label, error: e.message });
    console.log(`  ✗ ${label} — ${e.message}`);
  }
}

console.log(`\nสำเร็จ ${ok}/${rows.length} แถว`);
if (fails.length) {
  console.log(`ล้มเหลว ${fails.length} ชุด:`);
  fails.forEach(f => console.log(`  ${f.label}: ${f.error}`));
  process.exit(1);
}
