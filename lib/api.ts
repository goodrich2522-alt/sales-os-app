// lib/api.ts — ตัวเชื่อมต่อฐานข้อมูล Supabase (realtime)
// คงชื่อฟังก์ชันเดิมไว้ เพื่อให้ AppContext/หน้าต่างๆ ไม่ต้องแก้
// หมายเหตุ: อัปโหลดรูป inspection ยังใช้ GAS→Drive เดิม (ยังไม่ย้ายรูป)

import { supabase, supabaseEnabled } from "./supabaseClient";
import type {
  Forklift, Sale, InspectionRecord, DeletedInspectionRecord,
} from "./types";

const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL ?? "";
export const apiEnabled = supabaseEnabled;

export interface BootstrapData {
  forklifts: Forklift[];
  sales: Sale[];
  inspections: InspectionRecord[];
  deletedInspections: DeletedInspectionRecord[];
  fieldConfig: Record<string, unknown>;
}

function sb() {
  if (!supabase) throw new Error("Supabase ยังไม่ถูกตั้งค่า (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)");
  return supabase;
}

// ── อ่านข้อมูลทั้งหมดครั้งเดียว ──────────────────────────────────────────────
export async function bootstrap(): Promise<BootstrapData> {
  const c = sb();
  const [fk, sl, ins, cfg] = await Promise.all([
    c.from("forklifts").select("*").limit(5000),
    c.from("sales").select("*").limit(5000),
    c.from("inspections").select("*").limit(5000),
    c.from("app_config").select("data").eq("id", 1).maybeSingle(),
  ]);
  if (fk.error) throw fk.error;
  if (sl.error) throw sl.error;
  if (ins.error) throw ins.error;
  const insAll = (ins.data ?? []) as (InspectionRecord & { deleted_at?: string | null })[];
  const active = insAll.filter(r => !r.deleted_at) as InspectionRecord[];
  const deleted = insAll.filter(r => r.deleted_at).map(r => ({ ...r, deletedAt: r.deleted_at as string })) as DeletedInspectionRecord[];
  return {
    forklifts: (fk.data ?? []) as Forklift[],
    sales: (sl.data ?? []) as Sale[],
    inspections: active,
    deletedInspections: deleted,
    fieldConfig: ((cfg.data as { data?: Record<string, unknown> } | null)?.data) ?? {},
  };
}

// ── Forklift ────────────────────────────────────────────────────────────────
export const addForkliftApi    = async (f: Forklift) => { const { error } = await sb().from("forklifts").upsert(f); if (error) throw error; return { id: f.id }; };
// ใช้ update ตรง (ไม่ใช่ upsert) — ใต้ RLS เซลล์/ผู้ขนส่งมีสิทธิ์แค่ UPDATE ไม่มี INSERT
export const updateForkliftApi = async (f: Forklift) => { const { id, ...rest } = f; const { error } = await sb().from("forklifts").update(rest).eq("id", id); if (error) throw error; };
export const deleteForkliftApi = async (id: string)  => { const { error } = await sb().from("forklifts").delete().eq("id", id); if (error) throw error; };

// ── Sale ──────────────────────────────────────────────────────────────────--
export const addSaleApi    = async (s: Sale)    => { const { error } = await sb().from("sales").upsert(s); if (error) throw error; return { id: s.id }; };
export const deleteSaleApi = async (id: string) => { const { error } = await sb().from("sales").delete().eq("id", id); if (error) throw error; };

// ── Inspection (soft delete = ตั้ง deleted_at) ─────────────────────────────--
export const addInspectionApi = async (r: InspectionRecord) => {
  const { error } = await sb().from("inspections").upsert({ ...r, deleted_at: null });
  if (error) {
    // ยังไม่ได้รัน migration (ขาดคอลัมน์ image_slots / delivery_company / location_link)
    // → เซฟแบบตัดคอลัมน์ใหม่ทิ้งไปก่อน กันข้อมูลหลักหาย แล้วเตือนใน console
    const { image_slots: _slots, delivery_company: _dc, location_link: _ll, ...core } = r;
    const retry = await sb().from("inspections").upsert({ ...core, deleted_at: null });
    if (retry.error) throw error;
    console.warn("inspections ขาดคอลัมน์ใหม่ — รัน supabase-migration-2026-07-14.sql (delivery_company/location_link) และ 2026-07-13.sql (image_slots)");
  }
  return { id: r.id };
};
export const deleteInspectionApi  = async (id: string) => { const { error } = await sb().from("inspections").update({ deleted_at: new Date().toISOString() }).eq("id", id); if (error) throw error; };
export const restoreInspectionApi = async (id: string) => { const { error } = await sb().from("inspections").update({ deleted_at: null }).eq("id", id); if (error) throw error; };
export const purgeInspectionApi   = async (id: string) => { const { error } = await sb().from("inspections").delete().eq("id", id); if (error) throw error; };

// ── FieldConfig (เก็บใน app_config id=1) ────────────────────────────────────--
export const getFieldConfigApi  = async () => { const { data } = await sb().from("app_config").select("data").eq("id", 1).maybeSingle(); return ((data as { data?: Record<string, unknown> } | null)?.data) ?? {}; };
// เซฟผ่าน RPC merge_field_config — merge เฉพาะ key ที่ส่ง + DB ตัด knownUsers/adminEmails ทิ้งเสมอ
// (สิทธิ์ผู้ใช้แก้ได้ทาง admin_update_access เท่านั้น กันเครื่องที่ config เก่าทับสิทธิ์ที่แอดมินเพิ่งแก้)
export const saveFieldConfigApi = async (cfg: unknown) => {
  const { knownUsers: _ku, adminEmails: _ae, ...clean } = (cfg ?? {}) as Record<string, unknown>;
  const { error } = await sb().rpc("merge_field_config", { cfg: clean });
  if (error) {
    // fallback (ยังไม่รัน SQL เฟส 1): upsert ทั้งก้อนแบบเดิม
    const { error: e2 } = await sb().from("app_config").upsert({ id: 1, data: cfg });
    if (e2) throw e2;
  }
};
// เขียน config ทั้งก้อนตรงๆ (รวม knownUsers/adminEmails) — ใช้เฉพาะ fallback ของระบบสิทธิ์
// ช่วงที่ยังไม่รัน SQL เฟส 1 เท่านั้น · เมื่อเปิด RLS แล้วเส้นทางนี้จะถูก DB ปฏิเสธเอง
export const saveFullConfigApi = async (cfg: unknown) => {
  const { error } = await sb().from("app_config").upsert({ id: 1, data: cfg });
  if (error) throw error;
};

// ── อัปโหลดรูป inspection → ยังใช้ GAS→Drive เดิม ───────────────────────────
export const uploadImageApi = async (base64: string, mimeType: string, fileName: string) => {
  if (!GAS_URL) throw new Error("ไม่มี GAS_URL สำหรับอัปโหลดรูป");
  const res = await fetch(GAS_URL, {
    method: "POST", redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "uploadImage", payload: { base64, mimeType, fileName } }),
  });
  const json = (await res.json()) as { ok: boolean; data?: { url: string; fileId: string }; error?: string };
  if (!json.ok) throw new Error(json.error || "upload error");
  return json.data as { url: string; fileId: string };
};
