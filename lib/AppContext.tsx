"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Forklift, Sale, InspectionRecord, DeletedInspectionRecord, CustomFieldDef } from "./types";
import {
  mockForklifts, mockSales, mockInspections,
  BRANDS, FUEL_TYPES,
  DEFAULT_VEHICLE_GROUPS, DEFAULT_CONTROL_TYPES, DEFAULT_PO_STATUSES,
  DEFAULT_LOCATIONS, DEFAULT_STOCK_STATUSES,
  DEFAULT_CUSTOMER_TYPES, FINANCE_COMPANIES, SALE_TYPES,
} from "./mockData";
import * as api from "./api";
import { supabase } from "./supabaseClient";

// ── Field configuration ───────────────────────────────────────────────────────
export interface FieldConfig {
  // Stock form dropdowns
  brands: string[];
  vehicleGroups: string[];
  fuelTypes: string[];
  controlTypes: string[];
  poStatuses: string[];
  locations: string[];
  stockStatuses: string[];
  // Sales form dropdowns
  customerTypes: string[];
  financeCompanies: string[];
  saleTypes: string[];      // ประเภทการขาย
  paymentTypes: string[];   // ประเภทการชำระ
  // Custom field definitions
  customFieldDefs: CustomFieldDef[];      // stock form custom fields
  saleExtraFieldDefs: CustomFieldDef[];   // checkout form custom fields
  // Sales filter requests
  salesFilterRequests: string[];
  // จำผู้ใช้ที่ล็อกอินด้วย Google: อีเมล (ตัวพิมพ์เล็ก) → ชื่อ/บทบาท
  knownUsers: Record<string, { name: string; role: string }>;
}

const DEFAULT_FIELD_CFG: FieldConfig = {
  brands: BRANDS,
  vehicleGroups: DEFAULT_VEHICLE_GROUPS,
  fuelTypes: [...FUEL_TYPES],
  controlTypes: DEFAULT_CONTROL_TYPES,
  poStatuses: DEFAULT_PO_STATUSES,
  locations: DEFAULT_LOCATIONS,
  stockStatuses: DEFAULT_STOCK_STATUSES,
  customerTypes: DEFAULT_CUSTOMER_TYPES,
  financeCompanies: FINANCE_COMPANIES,
  saleTypes: [...SALE_TYPES],
  paymentTypes: ["เงินสด", "ไฟแนนซ์"],
  customFieldDefs: [],
  saleExtraFieldDefs: [],
  salesFilterRequests: [],
  knownUsers: {},
};

type DropdownField = keyof Omit<FieldConfig, "customFieldDefs" | "saleExtraFieldDefs" | "salesFilterRequests" | "knownUsers">;

// ── Context type ──────────────────────────────────────────────────────────────
interface AppContextType {
  forklifts: Forklift[];
  sales: Sale[];
  inspections: InspectionRecord[];
  deletedInspections: DeletedInspectionRecord[];
  fieldConfig: FieldConfig;
  addForklift: (f: Forklift) => void;
  updateForklift: (f: Forklift) => void;
  deleteForklift: (id: string) => void;
  addSale: (s: Sale) => void;
  deleteSale: (saleId: string) => void;
  addInspection: (r: InspectionRecord) => void;
  deleteInspection: (id: string) => void;
  restoreInspection: (id: string) => void;
  purgeInspection: (id: string) => void;
  refresh: () => Promise<void>;
  // Stock form field config
  updateFieldOptions: (field: DropdownField, options: string[]) => void;
  addCustomFieldDef: (name: string, type?: "text" | "select", options?: string[]) => void;
  removeCustomFieldDef: (id: string) => void;
  renameCustomFieldDef: (id: string, name: string) => void;
  addCustomFieldOption: (id: string, option: string) => void;
  removeCustomFieldOption: (id: string, idx: number) => void;
  editCustomFieldOption: (id: string, idx: number, val: string) => void;
  // Checkout extra field defs
  addSaleExtraFieldDef: (name: string, type?: "text" | "select", options?: string[]) => void;
  removeSaleExtraFieldDef: (id: string) => void;
  renameSaleExtraFieldDef: (id: string, name: string) => void;
  addSaleExtraFieldOption: (id: string, option: string) => void;
  removeSaleExtraFieldOption: (id: string, idx: number) => void;
  editSaleExtraFieldOption: (id: string, idx: number, val: string) => void;
  // Sales filter requests
  addSalesFilterRequest: (name: string) => void;
  removeSalesFilterRequest: (name: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const LS_KEYS = {
  forklifts:    "salesos_forklifts_v2",
  sales:        "salesos_sales_v2",
  inspMeta:     "salesos_insp_meta_v2",
  inspImages:   "salesos_insp_images_v2",
  deleted:      "salesos_deleted_insp_v2",
  deletedImages:"salesos_deleted_images_v2",
  fieldConfig:  "salesos_field_config_v2",
} as const;

function lsLoad<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); if (v) return JSON.parse(v) as T; } catch {}
  return fallback;
}
function lsSave(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function stripImages<T extends InspectionRecord>(arr: T[]): T[] {
  return arr.map(r => ({ ...r, images: [] as string[] }));
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ── Provider ──────────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted]     = useState(false);
  const [forklifts, setForklifts] = useState<Forklift[]>(mockForklifts);
  const [sales, setSales]         = useState<Sale[]>(mockSales);
  const [inspections, setInspections]         = useState<InspectionRecord[]>(mockInspections);
  const [deletedInspections, setDeletedInspections] = useState<DeletedInspectionRecord[]>([]);
  const [fieldConfig, setFieldConfig]         = useState<FieldConfig>(DEFAULT_FIELD_CFG);

  // ref ข้อมูลล่าสุด — ใช้หา forklift/sale ตอนต้องอัปเดตสถานะรถผ่าน API
  const forkliftsRef = useRef<Forklift[]>(forklifts);
  const salesRef     = useRef<Sale[]>(sales);
  const lastLocalEditRef = useRef(0); // เวลาที่แก้ข้อมูลในเครื่องล่าสุด — กัน auto-refresh ทับของที่เพิ่ง optimistic
  useEffect(() => { forkliftsRef.current = forklifts; }, [forklifts]);
  useEffect(() => { salesRef.current = sales; }, [sales]);

  useEffect(() => {
    let cancelled = false;

    // โหลดจาก localStorage (ใช้เป็น cache / fallback เมื่อไม่มี GAS หรือออฟไลน์)
    const loadFromLocal = () => {
      setForklifts(lsLoad(LS_KEYS.forklifts, mockForklifts));
      setSales(lsLoad(LS_KEYS.sales, mockSales));
      const savedMeta = lsLoad<InspectionRecord[]>(LS_KEYS.inspMeta, []);
      const savedImages = lsLoad<Record<string, string[]>>(LS_KEYS.inspImages, {});
      if (savedMeta.length > 0) {
        setInspections(savedMeta.map(r => ({ ...r, images: savedImages[r.id] ?? [] })));
      }
      const rawDeleted = lsLoad<DeletedInspectionRecord[]>(LS_KEYS.deleted, []);
      const deletedImages = lsLoad<Record<string, string[]>>(LS_KEYS.deletedImages, {});
      const now = Date.now();
      setDeletedInspections(
        rawDeleted
          .filter(r => now - new Date(r.deletedAt).getTime() < SEVEN_DAYS_MS)
          .map(r => ({ ...r, images: deletedImages[r.id] ?? [] }))
      );
      const lsOverride = lsLoad<Partial<FieldConfig>>(LS_KEYS.fieldConfig, {});
      setFieldConfig({ ...DEFAULT_FIELD_CFG, ...lsOverride });
    };

    (async () => {
      // โหลดจาก Google Sheets (ผ่าน GAS) ถ้าตั้งค่า NEXT_PUBLIC_GAS_URL ไว้
      if (api.apiEnabled) {
        try {
          const data = await api.bootstrap();
          if (cancelled) return;
          setForklifts(data.forklifts ?? []);
          setSales(data.sales ?? []);
          setInspections((data.inspections ?? []) as InspectionRecord[]);
          setDeletedInspections((data.deletedInspections ?? []) as DeletedInspectionRecord[]);
          setFieldConfig({ ...DEFAULT_FIELD_CFG, ...(data.fieldConfig as Partial<FieldConfig>) });
          setMounted(true);
          return;
        } catch (e) {
          console.warn("โหลดข้อมูลจาก Google Sheets ไม่สำเร็จ — ใช้ข้อมูลในเครื่องแทน", e);
        }
      }
      if (cancelled) return;
      loadFromLocal();
      setMounted(true);
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Realtime (Supabase) — เปลี่ยนที่ไหนเด้งทุกเครื่องทันที ──
  useEffect(() => {
    if (!mounted || !api.apiEnabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pull = async () => {
      try {
        const data = await api.bootstrap();
        setForklifts(data.forklifts ?? []);
        setSales(data.sales ?? []);
        setInspections((data.inspections ?? []) as InspectionRecord[]);
        setDeletedInspections((data.deletedInspections ?? []) as DeletedInspectionRecord[]);
        // ไม่อัปเดต fieldConfig จาก realtime — กัน loop การเซฟกลับ
      } catch (e) { console.warn("realtime pull", e); }
    };
    const onChange = () => { clearTimeout(timer); timer = setTimeout(pull, 300); }; // debounce รวมหลาย event

    const channel = supabase?.channel("salesos-db")
      .on("postgres_changes", { event: "*", schema: "public", table: "forklifts" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "inspections" }, onChange)
      .subscribe();

    // สำรอง: กลับมาที่แท็บ = ดึงสด + poll เบาๆ 60 วิ กัน realtime หลุด
    const onVisible = () => { if (document.visibilityState === "visible") pull(); };
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(() => { if (document.visibilityState === "visible") pull(); }, 60_000);

    return () => {
      if (channel) supabase?.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id); clearTimeout(timer);
    };
  }, [mounted]);

  useEffect(() => { if (mounted) lsSave(LS_KEYS.forklifts, forklifts); }, [forklifts, mounted]);
  useEffect(() => { if (mounted) lsSave(LS_KEYS.sales, sales); }, [sales, mounted]);
  useEffect(() => {
    if (!mounted) return;
    lsSave(LS_KEYS.inspMeta, stripImages(inspections));
    const imgMap: Record<string, string[]> = {};
    inspections.forEach(r => { if (r.images.length > 0) imgMap[r.id] = r.images; });
    lsSave(LS_KEYS.inspImages, imgMap);
  }, [inspections, mounted]);
  useEffect(() => {
    if (!mounted) return;
    lsSave(LS_KEYS.deleted, stripImages(deletedInspections as InspectionRecord[]).map(
      (r, i) => ({ ...r, deletedAt: (deletedInspections[i] as DeletedInspectionRecord).deletedAt })
    ));
    const deletedImgMap: Record<string, string[]> = {};
    deletedInspections.forEach(r => { if (r.images.length > 0) deletedImgMap[r.id] = r.images; });
    lsSave(LS_KEYS.deletedImages, deletedImgMap);
  }, [deletedInspections, mounted]);
  useEffect(() => {
    if (!mounted) return;
    lsSave(LS_KEYS.fieldConfig, fieldConfig);
    if (api.apiEnabled) api.saveFieldConfigApi(fieldConfig).catch(() => {});
  }, [fieldConfig, mounted]);

  // ── Forklift CRUD ─────────────────────────────────────────────────────────
  const addForklift = useCallback((f: Forklift) => {
    lastLocalEditRef.current = Date.now();
    setForklifts(p => [f, ...p]);
    if (api.apiEnabled) api.addForkliftApi(f).catch(e => console.warn("addForklift", e));
  }, []);
  const updateForklift = useCallback((f: Forklift) => {
    lastLocalEditRef.current = Date.now();
    setForklifts(p => p.map(x => x.id === f.id ? f : x));
    if (api.apiEnabled) api.updateForkliftApi(f).catch(e => console.warn("updateForklift", e));
  }, []);
  const deleteForklift = useCallback((id: string) => {
    lastLocalEditRef.current = Date.now();
    setForklifts(p => p.filter(f => f.id !== id));
    if (api.apiEnabled) api.deleteForkliftApi(id).catch(e => console.warn("deleteForklift", e));
  }, []);

  // ── Sale CRUD ─────────────────────────────────────────────────────────────
  const addSale = useCallback((s: Sale) => {
    lastLocalEditRef.current = Date.now();
    setSales(p => [s, ...p]);
    const nextStatus = s.sale_status === "จอง" || s.sale_status === "รอผ่านไฟแนนซ์" ? "จองแล้ว" : "ส่งมอบแล้ว";
    setForklifts(p => p.map(f => f.id === s.forklift_id ? { ...f, status: nextStatus } : f));
    if (api.apiEnabled) {
      api.addSaleApi(s).catch(e => console.warn("addSale", e));
      const target = forkliftsRef.current.find(f => f.id === s.forklift_id);
      if (target) api.updateForkliftApi({ ...target, status: nextStatus }).catch(e => console.warn("updateForklift", e));
    }
  }, []);
  const deleteSale = useCallback((saleId: string) => {
    lastLocalEditRef.current = Date.now();
    const sale = salesRef.current.find(s => s.id === saleId);
    setSales(prev => {
      if (sale) setForklifts(fls => fls.map(f => f.id === sale.forklift_id ? { ...f, status: "พร้อมขาย" } : f));
      return prev.filter(s => s.id !== saleId);
    });
    if (api.apiEnabled) {
      api.deleteSaleApi(saleId).catch(e => console.warn("deleteSale", e));
      if (sale) {
        const target = forkliftsRef.current.find(f => f.id === sale.forklift_id);
        if (target) api.updateForkliftApi({ ...target, status: "พร้อมขาย" }).catch(e => console.warn("updateForklift", e));
      }
    }
  }, []);

  // ── Inspection CRUD ───────────────────────────────────────────────────────
  const addInspection = useCallback((r: InspectionRecord) => {
    lastLocalEditRef.current = Date.now();
    setInspections(p => [r, ...p]); // optimistic — แสดงรูป base64 ทันที
    if (!api.apiEnabled) return;
    (async () => {
      try {
        // อัปโหลดรูป base64 → Google Drive แล้วเก็บเป็น URL แทน
        const urls = await Promise.all((r.images || []).map(async (img) => {
          if (!img.startsWith("data:")) return img; // เป็น URL อยู่แล้ว
          const mime = /^data:(.*?);base64,/.exec(img)?.[1] || "image/jpeg";
          return (await api.uploadImageApi(img, mime, `${r.unit_no}_${r.id}`)).url;
        }));
        const record: InspectionRecord = { ...r, images: urls };
        await api.addInspectionApi(record);
        setInspections(p => p.map(x => x.id === r.id ? record : x)); // เปลี่ยน base64 → URL
      } catch (e) {
        console.warn("addInspection", e);
      }
    })();
  }, []);
  const deleteInspection = useCallback((id: string) => {
    lastLocalEditRef.current = Date.now();
    setInspections(prev => {
      const item = prev.find(r => r.id === id);
      if (item) setDeletedInspections(d => [{ ...item, deletedAt: new Date().toISOString() }, ...d]);
      return prev.filter(r => r.id !== id);
    });
    if (api.apiEnabled) api.deleteInspectionApi(id).catch(e => console.warn("deleteInspection", e));
  }, []);
  const restoreInspection = useCallback((id: string) => {
    lastLocalEditRef.current = Date.now();
    setDeletedInspections(prev => {
      const item = prev.find(r => r.id === id);
      if (item) {
        const { deletedAt: _dt, ...record } = item;
        setInspections(ins => [record, ...ins]);
      }
      return prev.filter(r => r.id !== id);
    });
    if (api.apiEnabled) api.restoreInspectionApi(id).catch(e => console.warn("restoreInspection", e));
  }, []);
  const purgeInspection = useCallback((id: string) => {
    lastLocalEditRef.current = Date.now();
    setDeletedInspections(p => p.filter(r => r.id !== id));
    if (api.apiEnabled) api.purgeInspectionApi(id).catch(e => console.warn("purgeInspection", e));
  }, []);

  // ── Shared field-config helper ─────────────────────────────────────────────
  const updateFieldOptions = useCallback((field: DropdownField, options: string[]) => {
    setFieldConfig(prev => ({ ...prev, [field]: options }));
  }, []);

  // ── Stock custom field CRUD ───────────────────────────────────────────────
  const addCustomFieldDef = useCallback((name: string, type: "text" | "select" = "text", options: string[] = []) => {
    const def: CustomFieldDef = { id: `cf_${Date.now()}`, name: name.trim(), type, options: type === "select" ? options : undefined };
    setFieldConfig(prev => ({ ...prev, customFieldDefs: [...prev.customFieldDefs, def] }));
  }, []);
  const removeCustomFieldDef = useCallback((id: string) => {
    setFieldConfig(prev => ({ ...prev, customFieldDefs: prev.customFieldDefs.filter(d => d.id !== id) }));
  }, []);
  const renameCustomFieldDef = useCallback((id: string, name: string) => {
    setFieldConfig(prev => ({
      ...prev,
      customFieldDefs: prev.customFieldDefs.map(d => d.id === id ? { ...d, name: name.trim() } : d),
    }));
  }, []);
  const addCustomFieldOption = useCallback((id: string, option: string) => {
    setFieldConfig(prev => ({
      ...prev,
      customFieldDefs: prev.customFieldDefs.map(d =>
        d.id === id ? { ...d, options: [...(d.options ?? []), option.trim()] } : d
      ),
    }));
  }, []);
  const removeCustomFieldOption = useCallback((id: string, idx: number) => {
    setFieldConfig(prev => ({
      ...prev,
      customFieldDefs: prev.customFieldDefs.map(d =>
        d.id === id ? { ...d, options: (d.options ?? []).filter((_, i) => i !== idx) } : d
      ),
    }));
  }, []);
  const editCustomFieldOption = useCallback((id: string, idx: number, val: string) => {
    setFieldConfig(prev => ({
      ...prev,
      customFieldDefs: prev.customFieldDefs.map(d => {
        if (d.id !== id) return d;
        const opts = [...(d.options ?? [])]; opts[idx] = val.trim(); return { ...d, options: opts };
      }),
    }));
  }, []);

  // ── Sale extra field CRUD (checkout form) ─────────────────────────────────
  const addSaleExtraFieldDef = useCallback((name: string, type: "text" | "select" = "text", options: string[] = []) => {
    const def: CustomFieldDef = { id: `sef_${Date.now()}`, name: name.trim(), type, options: type === "select" ? options : undefined };
    setFieldConfig(prev => ({ ...prev, saleExtraFieldDefs: [...prev.saleExtraFieldDefs, def] }));
  }, []);
  const removeSaleExtraFieldDef = useCallback((id: string) => {
    setFieldConfig(prev => ({ ...prev, saleExtraFieldDefs: prev.saleExtraFieldDefs.filter(d => d.id !== id) }));
  }, []);
  const renameSaleExtraFieldDef = useCallback((id: string, name: string) => {
    setFieldConfig(prev => ({
      ...prev,
      saleExtraFieldDefs: prev.saleExtraFieldDefs.map(d => d.id === id ? { ...d, name: name.trim() } : d),
    }));
  }, []);
  const addSaleExtraFieldOption = useCallback((id: string, option: string) => {
    setFieldConfig(prev => ({
      ...prev,
      saleExtraFieldDefs: prev.saleExtraFieldDefs.map(d =>
        d.id === id ? { ...d, options: [...(d.options ?? []), option.trim()] } : d
      ),
    }));
  }, []);
  const removeSaleExtraFieldOption = useCallback((id: string, idx: number) => {
    setFieldConfig(prev => ({
      ...prev,
      saleExtraFieldDefs: prev.saleExtraFieldDefs.map(d =>
        d.id === id ? { ...d, options: (d.options ?? []).filter((_, i) => i !== idx) } : d
      ),
    }));
  }, []);
  const editSaleExtraFieldOption = useCallback((id: string, idx: number, val: string) => {
    setFieldConfig(prev => ({
      ...prev,
      saleExtraFieldDefs: prev.saleExtraFieldDefs.map(d => {
        if (d.id !== id) return d;
        const opts = [...(d.options ?? [])]; opts[idx] = val.trim(); return { ...d, options: opts };
      }),
    }));
  }, []);

  // ── Sales filter requests ─────────────────────────────────────────────────
  const addSalesFilterRequest = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setFieldConfig(prev => {
      if (prev.salesFilterRequests.includes(trimmed)) return prev;
      return { ...prev, salesFilterRequests: [...prev.salesFilterRequests, trimmed] };
    });
  }, []);
  const removeSalesFilterRequest = useCallback((name: string) => {
    setFieldConfig(prev => ({ ...prev, salesFilterRequests: prev.salesFilterRequests.filter(r => r !== name) }));
  }, []);

  // ดึงข้อมูลใหม่จาก Google Sheets ทันที (ปุ่มรีเฟรชเอง)
  const refresh = useCallback(async () => {
    if (!api.apiEnabled) return;
    try {
      const data = await api.bootstrap();
      setForklifts(data.forklifts ?? []);
      setSales(data.sales ?? []);
      setInspections((data.inspections ?? []) as InspectionRecord[]);
      setDeletedInspections((data.deletedInspections ?? []) as DeletedInspectionRecord[]);
    } catch (e) { console.warn("refresh", e); }
  }, []);

  return (
    <AppContext.Provider value={{
      forklifts, sales, inspections, deletedInspections, fieldConfig,
      addForklift, updateForklift, deleteForklift,
      addSale, deleteSale,
      addInspection, deleteInspection, restoreInspection, purgeInspection,
      refresh,
      updateFieldOptions,
      addCustomFieldDef, removeCustomFieldDef, renameCustomFieldDef,
      addCustomFieldOption, removeCustomFieldOption, editCustomFieldOption,
      addSaleExtraFieldDef, removeSaleExtraFieldDef, renameSaleExtraFieldDef,
      addSaleExtraFieldOption, removeSaleExtraFieldOption, editSaleExtraFieldOption,
      addSalesFilterRequest, removeSalesFilterRequest,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
