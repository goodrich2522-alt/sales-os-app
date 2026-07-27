// scripts/health-check.mjs — เฟส 5: ตรวจสุขภาพข้อมูลใน Supabase (อ่านอย่างเดียว)
// ใช้แทนแผนเดิมที่จะใส่ unique constraint บน SN (ยกเลิกเพราะมี SN ที่ตั้งใจให้ซ้ำ)
// รันเป็นระยะเพื่อจับข้อมูลเพี้ยนตั้งแต่เนิ่นๆ
//
// ต้องตั้ง env: SUPABASE_URL, SUPABASE_KEY
// รัน: node scripts/health-check.mjs
const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!BASE || !KEY) { console.error("ต้องตั้ง SUPABASE_URL และ SUPABASE_KEY ก่อนรัน"); process.exit(1); }

const get = async (table, query = "select=*&limit=5000") => {
  const res = await fetch(`${BASE.replace(/\/$/, "")}/rest/v1/${table}?${query}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return res.json();
};

const [forklifts, sales, cfg] = await Promise.all([get("forklifts"), get("sales"), get("app_config")]);
const fieldCfg = cfg[0]?.data ?? {};
const okStatuses = new Set(fieldCfg.stockStatuses ?? []);

const norm = v => String(v ?? "").trim();
const warn = [];
const add = (level, title, items) => { if (items.length) warn.push({ level, title, items }); };

// ── รถ ──
const bySn = new Map();
forklifts.forEach(f => { const sn = norm(f.SN).toUpperCase(); if (sn) (bySn.get(sn) ?? bySn.set(sn, []).get(sn)).push(f); });

// SN ซ้ำที่ตรวจสอบแล้วว่าเป็นคนละคันจริง จะถูกติดป้าย "หมายเหตุ SN" ไว้ → ไม่ต้องเตือนซ้ำ
const dupGroups = [...bySn].filter(([, v]) => v.length > 1);
const confirmed = dupGroups.filter(([, v]) => v.every(f => norm(f.custom_fields?.["หมายเหตุ SN"])));
const unconfirmed = dupGroups.filter(([, v]) => !v.every(f => norm(f.custom_fields?.["หมายเหตุ SN"])));

add("⚠️", "SN ซ้ำที่ยังไม่ได้ตรวจสอบ (อาจกรอกซ้ำ)",
  unconfirmed.map(([sn, v]) => `${sn} — ${v.length} คัน: ${v.map(f => f.id).join(", ")}`));

add("ℹ️", "SN ซ้ำที่ยืนยันแล้วว่าเป็นคนละคันจริง",
  confirmed.map(([sn, v]) => `${sn} — ${v.length} คัน: ${v.map(f => f.id).join(", ")}`));

add("ℹ️", "รถที่ยังไม่มี SN (ปกติคือรถสั่งผลิตที่ยังไม่ผลิตเสร็จ)",
  forklifts.filter(f => !norm(f.SN)).map(f => `${f.id} — ${norm(f.model)} · ${norm(f.status)}`));

add("⚠️", "สถานะที่ไม่มีในรายการตัวเลือก (แอปจะแสดงผลเพี้ยน)",
  [...new Set(forklifts.map(f => norm(f.status)).filter(s => s && !okStatuses.has(s)))]);

add("ℹ️", "รถที่ยังไม่ได้ใส่ราคาทุน",
  [`${forklifts.filter(f => !Number(f.cost_price)).length} คัน จากทั้งหมด ${forklifts.length} คัน`]);

add("⚠️", "วันรับรถไม่ใช่รูปแบบ YYYY-MM-DD",
  forklifts.filter(f => norm(f.received_date) && !/^\d{4}-\d{2}-\d{2}$/.test(norm(f.received_date)))
    .map(f => `${f.id} — "${f.received_date}"`));

// ── ดีลขาย ──
const fkIds = new Set(forklifts.map(f => norm(f.id)));
add("🔴", "ดีลกำพร้า — ชี้ไปที่รถที่ไม่มีอยู่จริง",
  sales.filter(s => norm(s.forklift_id) && !fkIds.has(norm(s.forklift_id))).map(s => `${s.id} → ${s.forklift_id}`));

add("🔴", "ยอดขายผิดปกติ (เกิน 100 ล้านบาทต่อคัน — น่าจะเป็นข้อมูลทดสอบ)",
  sales.filter(s => Number(s.actual_sale) > 1e8).map(s => `${s.id} — ${norm(s.customer_name)} · ${Number(s.actual_sale).toLocaleString()} บาท`));

add("ℹ️", "ดีลที่ยังไม่มียอดขาย",
  [`${sales.filter(s => !Number(s.actual_sale)).length} รายการ จากทั้งหมด ${sales.length} รายการ`]);

// ── รายงาน ──
const clean = sales.filter(s => Number(s.actual_sale) > 0 && Number(s.actual_sale) < 1e8);
const revenue = clean.reduce((a, s) => a + Number(s.actual_sale), 0);
const soldCost = clean.reduce((a, s) => {
  const f = forklifts.find(x => norm(x.id) === norm(s.forklift_id));
  return a + (f ? Number(f.cost_price) || 0 : 0);
}, 0);

console.log("═══ สรุปข้อมูล ═══");
console.log(`  รถในระบบ ${forklifts.length} คัน · ดีลขาย ${sales.length} รายการ`);
console.log(`  ยอดขายรวม ${Math.round(revenue).toLocaleString()} บาท · ทุนของที่ขายไป ${Math.round(soldCost).toLocaleString()} บาท`);
if (soldCost) console.log(`  กำไรขั้นต้น ${Math.round(revenue - soldCost).toLocaleString()} บาท (${((revenue - soldCost) / revenue * 100).toFixed(1)}%)`);

console.log("\n═══ ผลตรวจ ═══");
if (!warn.length) console.log("  ✅ ไม่พบปัญหา");
warn.forEach(w => {
  console.log(`\n${w.level} ${w.title} (${w.items.length})`);
  w.items.slice(0, 15).forEach(i => console.log(`   · ${i}`));
  if (w.items.length > 15) console.log(`   … อีก ${w.items.length - 15} รายการ`);
});

const critical = warn.filter(w => w.level === "🔴").length;
console.log(`\n${critical ? `🔴 มีปัญหาที่ต้องแก้ ${critical} เรื่อง` : "✅ ไม่มีปัญหาระดับวิกฤต"}`);
