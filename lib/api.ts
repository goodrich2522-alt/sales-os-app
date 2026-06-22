// lib/api.ts — ตัวเชื่อมต่อ Google Apps Script Web App (ฐานข้อมูล Google Sheets)
//
// ⚠️ CORS: GAS Web App ไม่ตอบ preflight ฉะนั้นใช้เฉพาะ "simple request":
//   - อ่าน  = GET  ?action=...
//   - เขียน = POST body เป็น JSON string + Content-Type: text/plain;charset=utf-8
//     (ห้ามใช้ application/json หรือ custom header เพราะจะ trigger preflight)
//
// ถ้าไม่ได้ตั้ง NEXT_PUBLIC_GAS_URL → apiEnabled = false แอปจะ fallback ไปใช้ localStorage

import type {
  Forklift, Sale, InspectionRecord, DeletedInspectionRecord,
} from "./types";

const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL ?? "";
export const apiEnabled = GAS_URL.length > 0;

interface ApiResponse<T> { ok: boolean; data?: T; error?: string; }

export interface BootstrapData {
  forklifts: Forklift[];
  sales: Sale[];
  inspections: InspectionRecord[];
  deletedInspections: DeletedInspectionRecord[];
  fieldConfig: Record<string, unknown>;
}

async function apiGet<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  // _t = cache-buster กัน browser/CDN cache ข้อมูลเก่า (รีหน้าแล้วต้องได้ข้อมูลสด)
  const qs = new URLSearchParams({ action, ...params, _t: String(Date.now()) }).toString();
  const res = await fetch(`${GAS_URL}?${qs}`, { method: "GET", redirect: "follow", cache: "no-store" });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(json.error || "API error");
  return json.data as T;
}

async function apiPost<T>(action: string, payload: unknown): Promise<T> {
  const res = await fetch(GAS_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload }),
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(json.error || "API error");
  return json.data as T;
}

// ── อ่านข้อมูลทั้งหมดครั้งเดียว ──────────────────────────────────────────────
export const bootstrap = () => apiGet<BootstrapData>("bootstrap");

// ── Forklift ────────────────────────────────────────────────────────────────
export const addForkliftApi    = (f: Forklift) => apiPost<{ id: string }>("addForklift", f);
export const updateForkliftApi = (f: Forklift) => apiPost<unknown>("updateForklift", f);
export const deleteForkliftApi = (id: string)  => apiPost<unknown>("deleteForklift", { id });

// ── Sale ──────────────────────────────────────────────────────────────────--
export const addSaleApi    = (s: Sale)     => apiPost<{ id: string }>("addSale", s);
export const deleteSaleApi = (id: string)  => apiPost<unknown>("deleteSale", { id });

// ── Inspection ────────────────────────────────────────────────────────────--
export const addInspectionApi     = (r: InspectionRecord) => apiPost<{ id: string }>("addInspection", r);
export const deleteInspectionApi  = (id: string) => apiPost<unknown>("deleteInspection", { id });
export const restoreInspectionApi = (id: string) => apiPost<unknown>("restoreInspection", { id });
export const purgeInspectionApi   = (id: string) => apiPost<unknown>("purgeInspection", { id });

// ── FieldConfig ───────────────────────────────────────────────────────────--
export const getFieldConfigApi  = () => apiGet<Record<string, unknown>>("getFieldConfig");
export const saveFieldConfigApi = (cfg: unknown) => apiPost<unknown>("saveFieldConfig", cfg);

// ── อัปโหลดรูป inspection → คืน URL ของไฟล์ใน Drive ─────────────────────────
export const uploadImageApi = (base64: string, mimeType: string, fileName: string) =>
  apiPost<{ url: string; fileId: string }>("uploadImage", { base64, mimeType, fileName });
