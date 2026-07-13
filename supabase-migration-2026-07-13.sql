-- ============================================================
-- Migration 13 ก.ค. 2026 — รองรับรูปตรวจรถแบบระบุช่อง 6 รูป
-- ✅ รันแล้วเมื่อ 13 ก.ค. 2026 (ผ่าน Management API + ทดสอบเขียน/อ่านผ่าน)
-- วิธีรัน (ถ้าต้องรันซ้ำ): Supabase Dashboard → SQL Editor → Run
-- รันซ้ำได้ ไม่พังของเดิม (IF NOT EXISTS)
-- ============================================================

-- เก็บรูปแยกช่อง: { "name_plate": url, "pi_doc": url, "front": url,
--                   "back": url, "left": url, "right": url }
-- ส่วนคอลัมน์ images (jsonb) เดิม ยังเก็บรูปทั้งหมดรวมกันเหมือนเดิม
-- เพื่อให้หน้าเก่าๆ ที่อ่าน images ตรงๆ ใช้ได้ต่อ
alter table inspections add column if not exists image_slots jsonb;

-- เบอร์โทรผู้ขนส่ง (หน้าผู้ขนส่งล็อกอินด้วยชื่อเล่น+เบอร์ ไม่ใช้อีเมล) — เพิ่ม 13 ก.ค. 2026 รอบ 2
alter table inspections add column if not exists transporter_phone text;

-- หมายเหตุสถานะปัจจุบัน (ตรวจเมื่อ 13 ก.ค. 2026):
--   - inspections.images เป็น jsonb เก็บ array ของ URL → รองรับการอัปโหลดรูปอยู่แล้ว
--   - ตัวรูปจริงเก็บบน Google Drive ผ่าน GAS (ไม่ได้เก็บใน Postgres) → ขนาด DB ไม่บวม
--   - forklifts.id เป็น text → ระบบรหัสสินค้าอัตโนมัติ (FK-0001 ฯลฯ) ใช้คอลัมน์เดิมได้เลย
--   - ⚠️ RLS ยังไม่เปิด — ดูแผน DEV-PLAN.md เฟส 1 (งานด่วนคนละเรื่องกับ migration นี้)
