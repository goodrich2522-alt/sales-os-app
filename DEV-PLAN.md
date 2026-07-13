# DEV-PLAN.md — แผนพัฒนา SalesOS-App (จากผลตรวจช่องโหว่ + โค้ดซ้ำ)

> **ที่มา:** ผลการตรวจสอบทั้งแอปโดย Claude เมื่อ **13 ก.ค. 2026** (อ่านโค้ดครบทุกไฟล์)
> **สถานะ:** 🟡 กำลังทำเฟส 1 — โครงสร้าง RLS+Auth เสร็จ+ทดสอบผ่านแล้ว เหลือ deploy โค้ดใหม่แล้วสับสวิตช์ · อัปเดต ☐ → ☑ + ลงวันที่เมื่อทำเสร็จ
> **สรุปสั้น:** มีช่องโหว่ระดับวิกฤต 3 จุดที่ทำให้ข้อมูลลูกค้า/ราคาทุนรั่วได้ทั้งหมด → ต้องทำเฟส 1 ก่อนทุกอย่าง

---

## 🔴 เฟส 1: อุดรูรั่วข้อมูล (ด่วนสุด)

**ปัญหาที่แก้:** anon key อ่าน/เขียน/ลบได้ทุกตาราง · login ปลอมได้ 100% (localStorage อย่างเดียว) · GAS endpoint เปิดโล่ง
**เว็บอยู่บน GitHub Pages สาธารณะ** — ใครก็ดึง key จาก JS bundle ได้ ถือว่า key ปัจจุบันรั่วแล้ว

> **🟢 ความคืบหน้า 13 ก.ค. 2026 — โครงสร้างพร้อม 90% เหลือแค่ "สับสวิตช์" หลัง deploy**
> โค้ด + SQL + Auth ทำเสร็จและทดสอบผ่านครบ 20/20 เคสแล้ว (สคริปต์ทดสอบเปิด RLS จริงชั่วคราวแล้วปิดกลับ)
> RLS **ยังไม่เปิดถาวร** เพราะแอปเวอร์ชันเก่าบน GitHub Pages ยังใช้ anon key เขียนตรง — ต้อง deploy โค้ดใหม่ก่อน ไม่งั้นทีมใช้ไม่ได้

- ☑ 1.1a (13 ก.ค.) **SQL functions + policies + seed แอดมิน** — รันบน DB แล้ว (`supabase-phase1-rls-2026-07-13.sql`) · policy ครบทุกตาราง + RPC (`my_access`/`register_me`/`merge_field_config`/`admin_update_access`) · ทดสอบผ่าน 20/20
- ☑ 1.2 (13 ก.ค.) **เปิด Supabase Auth (Google provider)** — เปิดใน Supabase แล้ว + [GoogleLoginButton.tsx](components/GoogleLoginButton.tsx) ใช้ `signInWithIdToken` (Supabase verify signature) + ทุกหน้า main เช็ค session จริง
- ☐ 1.1b **สับสวิตช์เปิด RLS ถาวร** — รันส่วน B ใน [supabase-phase1-rls-2026-07-13.sql](supabase-phase1-rls-2026-07-13.sql) (`enable row level security` + ลบ policy `open_all`) **หลัง deploy โค้ดใหม่แล้วเท่านั้น** → บอก Claude ให้รันให้ได้
- ☐ 1.3 **Rotate anon key ใหม่** หลังเปิด RLS ถาวร (key เดิมถือว่าหลุดแล้ว)
- ☐ 1.4 **ใส่ secret token ใน GAS endpoint** (ฝั่ง Apps Script เช็คก่อนรับอัปโหลด) — ระยะยาว: ย้ายรูปไป Supabase Storage + คุมด้วย RLS แล้วเลิกใช้ GAS
- ☐ 1.5 **พิจารณาย้าย GitHub Pages → Vercel** (ฟรีเหมือนกัน แต่คุมการเข้าถึงได้ / GitHub Pages ปิดกั้นอะไรไม่ได้) — ถ้าย้าย: แก้ `basePath` ใน [next.config.ts](next.config.ts) + workflow deploy

**เกณฑ์ผ่านเฟส 1:** เปิด browser ใหม่ (ไม่ login) ยิง REST ไปที่ Supabase ด้วย anon key → ต้องได้ข้อมูล **0 แถว** ทุกตาราง (ทดสอบแบบ simulate ผ่านแล้ว — รอยืนยันจริงหลังสับสวิตช์)

### ⚠️ ลำดับ deploy เฟส 1 (ห้ามสลับ — ไม่งั้นทีมใช้ไม่ได้ชั่วคราว)
1. ☐ ตั้ง Google Cloud OAuth: verify **Authorized JavaScript origins** มีโดเมน deploy (`https://goodrich2522-alt.github.io`) — น่าจะมีแล้วเพราะ login เดิมทำงานได้ · (ทางเลือก) ใส่ Google Client Secret ใน Supabase ให้ครบ
2. ☑ (13 ก.ค.) ตั้ง `Site URL` + `uri_allow_list` ของ Supabase Auth = `https://goodrich2522-alt.github.io/sales-os-app.github.io/` (ทำผ่าน API แล้ว)
3. ☑ (13 ก.ค.) **Deploy โค้ดใหม่ขึ้น Pages** — push master → GitHub Actions build+deploy สำเร็จ (commit e712434) · เว็บ /admin/users ตอบ 200 แล้ว
4. ☐ **ทดสอบ login จริงทุก role บนเว็บ production** (สำคัญ — ทำก่อนสับ RLS) → ดูหัวข้อล่าง
5. ☐ สับสวิตช์ RLS ถาวร (ข้อ 1.1b) — บอก Claude รันให้
6. ☐ rotate anon key (ข้อ 1.3)

### 🚧 ค้างก่อนสับ RLS — write path ของหน้าผู้ขนส่ง (เพิ่ม 13 ก.ค. รอบ 2)
หน้าผู้ขนส่งเปลี่ยนเป็นล็อกอิน **ชื่อเล่น+เบอร์** (ไม่มี Supabase session) ตามที่ต้องการ → เมื่อเปิด RLS ถาวร ผู้ขนส่งจะ **เขียน inspection / อัปเดตสถานะรถไม่ได้** เพราะไม่มี JWT
ต้องเลือก 1 ทางก่อนสับสวิตช์ RLS:
- **ทาง A (แนะนำ):** เปิด anonymous sign-in (`external_anonymous_users_enabled`) + ให้หน้าผู้ขนส่ง `signInAnonymously()` + เพิ่ม policy ให้ anon session: select/update `forklifts` + select/insert/update `inspections` (ไม่แตะ `sales`) — ⚠️ ต้องแดนยืนยันเพราะเป็นการเปิด auth แบบ anonymous
- **ทาง B:** สร้าง RPC `receive_forklift()` / `deliver_forklift()` แบบ SECURITY DEFINER ให้ anon เรียกได้ (คุมแคบกว่า แต่โค้ดเยอะกว่า)
> ตอนนี้ยังไม่กระทบ เพราะ RLS ยังไม่เปิด (open_all ยังอยู่) — แต่ **ห้ามสับ RLS จนกว่าจะทำข้อนี้เสร็จ**

### 🧪 เช็คก่อนสับ RLS (แดนทำบนเว็บจริง ~2 นาที)
- เข้า `https://goodrich2522-alt.github.io/sales-os-app.github.io/` → ลองล็อกอินหน้าทีมขาย/สต็อกด้วย Google บัญชีที่อนุมัติแล้ว → ต้องเข้าได้ + เห็นข้อมูล
- เข้า `/admin/users` ด้วย goodrichforklift@gmail.com → ต้องเห็นรายชื่อผู้ใช้ 5 คน
- ถ้า 2 ข้อนี้ผ่าน = signInWithIdToken ทำงานบน production → พร้อมสับ RLS ได้เลย
- ถ้าล็อกอินไม่ได้ (ปุ่ม Google ไม่ขึ้น/error) = ต้องเพิ่มโดเมนใน Google Cloud origins ก่อน (ข้อ 1)

---

## 🟠 เฟส 2: สิทธิ์ตามบทบาท (ต่อจากเฟส 1)

**ปัญหาที่แก้:** ใครก็ลงทะเบียน role ตัวเองได้ (knownUsers เขียนผ่าน anon key) · ผู้ขนส่งลบรถออกจากสต็อกถาวรได้ทั้งที่ login แค่กรอกชื่อ

> **อัปเดต 13 ก.ค. 2026:** ทำระบบสิทธิ์ระดับ UI แล้ว — หน้า `/admin/users` (อนุมัติ/ระงับ/เปลี่ยน role/จัดการแอดมิน) + ผู้ใช้ใหม่เป็น "รออนุมัติ" + กัน role ข้ามหน้า + แดชบอร์ดจำกัดเฉพาะผู้ใช้อนุมัติแล้ว · **แต่ยังเป็นแค่ UI** — anon key ยังเขียนตรงได้ ต้องทำ RLS (เฟส 1) ถึงจะกันจริง

- ☐ 2.1 สร้างตาราง `profiles` (uid → name, role) ผูกกับ Supabase Auth — **เลิกใช้ `knownUsers` ใน app_config** และแก้ [lib/auth.ts](lib/auth.ts)
- ☐ 2.2 RLS แยกตาม role: ผู้ขนส่งเขียนได้แค่ `inspections` · เซลล์เขียน `sales` · สต็อกเขียน `forklifts` · การลบจำกัดเฉพาะ role ที่กำหนด
- ☑ 2.3 (13 ก.ค.) **เอาการลบรถออกจากสต็อกออกจากหน้าผู้ขนส่ง** — `deleteHistory` ลบเฉพาะ inspection แล้ว (ไม่แตะ forklifts) + RLS ไม่ให้ผู้ขนส่งลบรถอยู่แล้ว
- ☑ 2.4 (13 ก.ค.) **หน้า login ผู้ขนส่ง → Google login** — เปลี่ยนจาก "กรอกชื่ออย่างเดียว" เป็น Google SSO + รออนุมัติ เหมือน role อื่นแล้ว
- ☐ 2.5 ลดการ cache PII ลง localStorage (ข้อมูลลูกค้า/ยอดขายค้างในทุกเครื่องที่เคยเปิด รวมมือถือคนขนส่ง) — เก็บเฉพาะเท่าที่ role นั้นจำเป็น

---

## 🟡 เฟส 3: ลดโค้ดซ้ำ + ลบโค้ดตาย (ไม่เร่ง ทำแทรกได้)

| ☐ | งาน | รายละเอียด |
|---|-----|-----------|
| ☐ | ลบ `lib/supabase.ts` | โค้ดตาย — ไม่มีใคร import (ทุกที่ใช้ `lib/supabaseClient.ts`) |
| ☐ | ลบ mock ที่ไม่ใช้ใน `lib/mockData.ts` | `mockMonthlySales`, `mockSalesLeaderboard`, `mockBrandShare`, `mockTopModels`, `mockStockStatus`, `mockPaymentTypes`, `mockStockUsers`, `mockSalesUsers` (2 ตัวหลังมี password "1234" ฝังอยู่ — ไม่ถูกใช้แต่ต้องลบ) |
| ☐ | ถอด `next-pwa` ออกจาก package.json | dependency ไม่ถูกใช้เลย |
| ☐ | แยก `<Lightbox>` component ร่วม | ตอนนี้ซ้ำ 4 ชุด: sales/main ×2, transporter, dashboard/inspections |
| ☐ | แยก `<OptionsEditor>` + `<CustomFieldWizard>` | Settings modal ใน sales/main กับ stock/main โค้ดก๊อปกัน ~250 บรรทัด × 2 |
| ☐ | รวม helper ซ้ำ | `SField`≈`FF`, `si/ss`≈`ic/sc` (ต่างแค่สี — รับ color เป็น prop), `FilterChipRow`≈`ChipGroup`, `hay`≈`hs`, `daysUntil`≈`daysLeft` |
| ☐ | สร้าง `lib/constants.ts` | รวม `STATUS_BADGE` (sales+stock), `CONTACT_SOURCE_COLORS` (sales+dashboard), `TH_MON` (stock+transporter+dashboard) |
| ☐ | สร้าง `lib/format.ts` | รวม `thaiDate`, `fmtAdded`, `daysUntil`, `specCode` (สูตร "รหัสสเปก" ตอนนี้ join ซ้ำ 3 ที่) |

**ประมาณการ:** ตัดโค้ดได้ ~600-800 บรรทัด · หลังทำเสร็จรัน `npm run build` + ไล่เทสต์ทุกหน้าให้ครบ

---

## 🐛 เฟส 4: แก้บั๊กที่พบระหว่างตรวจ

- ☐ 4.1 **`lastLocalEditRef` ไม่ทำงานจริง** — [lib/AppContext.tsx:141](lib/AppContext.tsx#L141) ตั้งค่าไว้แต่ `pull()` ไม่เคยเช็ค → optimistic update ถูก realtime ทับได้ · แก้: ใน `pull()` skip ถ้า `Date.now() - lastLocalEditRef.current < 3000`
- ☑ 4.2 (บางส่วน — 13 ก.ค. 2026) **id ชนกันได้** — forklift เปลี่ยนเป็นรหัสสินค้าอัตโนมัติแล้ว (`FK-0001`/`ST-0001`/`HL-0001` ดู `lib/productId.ts`) · ☐ ยังเหลือ: sale/inspection ยังใช้ `Date.now()`
- ☐ 4.3 **สถานะ "รอรับ" ไม่มีใน default** — transporter หารถ `status === "รอรับ"` แต่ `DEFAULT_STOCK_STATUSES` ใน [lib/mockData.ts](lib/mockData.ts#L52) ไม่มีค่านี้ → ฟีเจอร์รับรถตาม PI หาไม่เจอจนกว่าจะเพิ่มเอง
- ☐ 4.4 **กราฟรายเดือนไม่แยกปี** — [app/dashboard/page.tsx:152-156](app/dashboard/page.tsx#L152-L156) ใช้ `getMonth()` อย่างเดียว ยอดคนละปีบวกรวมเดือนเดียวกัน
- ☐ 4.5 **แกลเลอรีโชว์สเปครถจาก mock** — [app/dashboard/inspections/page.tsx](app/dashboard/inspections/page.tsx#L159) ใช้ `mockTransporterData` (ข้อมูลปลอม) → เปลี่ยนเป็นหาจาก `forklifts` จริงด้วย unit_no
- ☐ 4.6 **ลบดีลแล้วรีเซ็ตสถานะรถผิด** — `deleteSale` hard-code "พร้อมขาย" แม้รถเดิมสถานะอื่น → เก็บสถานะก่อนขายไว้แล้วคืนค่าเดิม
- ☐ 4.7 **config ทับกันข้ามเครื่อง (lost update)** — `saveFieldConfigApi` ทับ `app_config id=1` ทั้งก้อน + AppContext เซฟกลับตั้งแต่โหลดครั้งแรก → สองเครื่องแก้พร้อมกัน = ตัวเลือกหาย · แก้ระยะสั้น: อย่าเซฟตอน mount แรก · ระยะยาว: แตก config เป็นแถวย่อยหรือใช้ merge

---

## ลำดับที่แนะนำ

```
เฟส 1 (ทำทันที ห้ามข้าม) → เฟส 2 → เฟส 4 (บั๊ก) → เฟส 3 (ลดโค้ดซ้ำ ทำแทรกตอนไหนก็ได้)
```

> ⚠️ ตราบใดที่เฟส 1 ยังไม่เสร็จ ข้อมูลลูกค้า + ราคาทุนของบริษัทเปิดโล่งอยู่บนอินเทอร์เน็ต
