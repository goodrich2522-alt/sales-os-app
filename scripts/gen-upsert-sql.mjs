// scripts/gen-upsert-sql.mjs — เฟส 4: สร้าง SQL upsert จาก apply-forklifts.json
// แบ่งเป็นไฟล์ย่อยเพื่อรันทีละชุด · ไม่ได้เขียน DB เอง
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "local-data");
const SQL_DIR = join(DIR, "sql");
const BATCH = Number(process.argv[2] ?? 60);

const rows = JSON.parse(readFileSync(join(DIR, "apply-forklifts.json"), "utf8"));

// ตัดคีย์ที่เป็นเมตาดาต้าออกจาก custom_fields (ไม่ใช่ข้อมูลธุรกิจ ลดขนาด SQL)
const DROP_CF = new Set(["ชีตต้นทาง"]);

const q = v => v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`;
const n = v => (Number(v) || 0);
const cf = o => {
  if (!o) return "null";
  const clean = Object.fromEntries(Object.entries(o).filter(([k, v]) => !DROP_CF.has(k) && String(v ?? "").trim()));
  return Object.keys(clean).length ? `'${JSON.stringify(clean).replace(/'/g, "''")}'::jsonb` : "null";
};

const COLS = ["id", `"SN"`, "brand", "model", "cost_price", "stock_price", "status", "received_date",
  "pi_no", "vehicle_category", "vehicle_group", "height", "capacity_kg", "location", "custom_fields", "created_at"];

const tuple = r => `(${[
  q(r.id), q(r.SN), q(r.brand), q(r.model), n(r.cost_price), n(r.stock_price), q(r.status), q(r.received_date),
  q(r.pi_no), q(r.vehicle_category), q(r.vehicle_group), q(r.height), q(r.capacity_kg), q(r.location),
  cf(r.custom_fields), q(r.created_at),
].join(",")})`;

// อัปเดตเฉพาะคอลัมน์ที่เรานำเข้า — คอลัมน์อื่น (fuel, year, attachments ฯลฯ) ไม่แตะ
const UPDATE_SET = COLS.filter(c => c !== "id" && c !== "created_at")
  .map(c => `${c}=excluded.${c}`).join(",");

if (existsSync(SQL_DIR)) rmSync(SQL_DIR, { recursive: true });
mkdirSync(SQL_DIR, { recursive: true });

let total = 0;
const files = [];
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const sql = `insert into forklifts (${COLS.join(",")}) values\n${chunk.map(tuple).join(",\n")}\non conflict (id) do update set ${UPDATE_SET};`;
  const name = `upsert-${String(files.length + 1).padStart(2, "0")}.sql`;
  writeFileSync(join(SQL_DIR, name), sql, "utf8");
  files.push({ name, rows: chunk.length, kb: Math.round(sql.length / 1024) });
  total += sql.length;
}

console.log(`สร้าง SQL ${files.length} ไฟล์ · ${rows.length} แถว · รวม ${Math.round(total / 1024)} KB`);
files.forEach(f => console.log(`  ${f.name} — ${f.rows} แถว · ${f.kb} KB`));
console.log(`\nโฟลเดอร์: local-data/sql/`);
