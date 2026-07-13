-- ============================================================
-- Normalize forklifts.status → ชุดมาตรฐาน 5 สถานะ · 13 ก.ค. 2026
-- ยืนยัน mapping โดยเจ้าของแล้ว · backup อยู่ที่ status-backup-2026-07-13.json (165 แถว)
-- ชุดมาตรฐาน: รอรับ / พร้อมขาย / จอง / รอผ่านไฟแนนซ์ / ปิดการขายแล้ว
-- (รถเช่า 7 คัน → ปิดการขายแล้ว + tag ดีลเป็น sale_type='รถเช่า')
-- รันซ้ำได้ (idempotent)
-- ============================================================

-- 1) รถเช่า → ดีลที่ผูกอยู่ tag เป็น sale_type='รถเช่า' (ทำก่อนเปลี่ยน status จะได้ยัง match รถเช่าได้)
update sales s set sale_type = 'รถเช่า'
from forklifts f
where s.forklift_id = f.id
  and f.status in ('รถเช่า','เช่า','รถเช่า GR-197')
  and (s.sale_type is null or s.sale_type = '');

-- 2) normalize status ทั้งหมดในคำสั่งเดียว
update forklifts set status =
  case
    -- รถ 3 คันที่ status=พร้อมขาย แต่มีดีลขายแล้วผูกอยู่ (ข้อมูลขัดแย้ง) → ปิดการขาย
    when id in ('FK-010253R3919','FK-66064-3','FK-66062-1') then 'ปิดการขายแล้ว'
    when status like '%ขายแล้ว%'                            then 'ปิดการขายแล้ว'
    when status = '1969-12-01T17:00:00.000Z'                then 'ปิดการขายแล้ว' -- status โดนวันที่ทับ แต่มีดีล
    when status in ('รถเช่า','เช่า','รถเช่า GR-197')         then 'ปิดการขายแล้ว' -- รถเช่า → ปิดการขาย (5 สถานะ)
    when status in ('จองแล้ว','ติดจอง','ติดจอง/รอส่ง','ดรีม','แก้วจอง') then 'จอง'
    when status = 'รอเข้าไปรับ' or status like 'สั่งผลิต%'   then 'รอรับ'
    else status
  end
where status is not null;

-- 3) ล็อกตัวเลือกสถานะสต็อกใน app_config ให้เหลือเฉพาะ 5 สถานะ
update app_config
   set data = jsonb_set(data, '{stockStatuses}',
       '["รอรับ","พร้อมขาย","จอง","รอผ่านไฟแนนซ์","ปิดการขายแล้ว"]'::jsonb)
 where id = 1;
