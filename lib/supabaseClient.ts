import { createClient } from "@supabase/supabase-js";

// อ่านค่าจาก env (ฝังตอน build เหมือน GAS URL เดิม)
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseEnabled = url.length > 0 && anon.length > 0;

// ถ้ายังไม่ตั้งค่า → null (แอป fallback ไป GAS/local เดิม กันพังระหว่างย้าย)
export const supabase = supabaseEnabled
  ? createClient(url, anon, { auth: { persistSession: false } })
  : null;
