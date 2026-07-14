-- ============================================================
-- inspections: เพิ่มข้อมูลการส่งมอบ (หน้าผู้ส่งมอบรถ) · 14 ก.ค. 2026
--   delivery_company  = บริษัท/สถานที่ที่ไปส่ง
--   location_link     = ลิงก์โลเคชั่นหน้างาน (Google Maps ฯลฯ)
-- รันซ้ำได้ (idempotent)
-- ============================================================
alter table inspections add column if not exists delivery_company text;
alter table inspections add column if not exists location_link    text;
