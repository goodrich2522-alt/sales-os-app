"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Forklift, Sale, InspectionRecord, DeletedInspectionRecord, CustomFieldDef } from "./types";
import { mockForklifts, mockSales, mockInspections, BRANDS, FUEL_TYPES, DEFAULT_VEHICLE_GROUPS, DEFAULT_CONTROL_TYPES, DEFAULT_PO_STATUSES, DEFAULT_LOCATIONS, DEFAULT_STOCK_STATUSES } from "./mockData";

// ── Field configuration ───────────────────────────────────────────────────────
export interface FieldConfig {
  brands: string[];
  vehicleGroups: string[];
  fuelTypes: string[];
  controlTypes: string[];
  poStatuses: string[];
  locations: string[];
  stockStatuses: string[];
  customFieldDefs: CustomFieldDef[];     // extra fields on the stock form
  saleExtraFieldDefs: CustomFieldDef[];  // extra fields on the checkout form
  salesFilterRequests: string[];         // filter dimensions requested by sales team
}

const DEFAULT_FIELD_CFG: FieldConfig = {
  brands: BRANDS,
  vehicleGroups: DEFAULT_VEHICLE_GROUPS,
  fuelTypes: [...FUEL_TYPES],
  controlTypes: DEFAULT_CONTROL_TYPES,
  poStatuses: DEFAULT_PO_STATUSES,
  locations: DEFAULT_LOCATIONS,
  stockStatuses: DEFAULT_STOCK_STATUSES,
  customFieldDefs: [],
  saleExtraFieldDefs: [],
  salesFilterRequests: [],
};

type DropdownField = keyof Omit<FieldConfig, "customFieldDefs" | "saleExtraFieldDefs" | "salesFilterRequests">;

// ── Context type ──────────────────────────────────────────────────────────────
interface AppContextType {
  forklifts: Forklift[];
  sales: Sale[];
  inspections: InspectionRecord[];
  deletedInspections: DeletedInspectionRecord[];
  fieldConfig: FieldConfig;
  addForklift: (f: Forklift) => void;
  deleteForklift: (id: string) => void;
  addSale: (s: Sale) => void;
  deleteSale: (saleId: string) => void;
  addInspection: (r: InspectionRecord) => void;
  deleteInspection: (id: string) => void;
  restoreInspection: (id: string) => void;
  purgeInspection: (id: string) => void;
  // Stock form field config
  updateFieldOptions: (field: DropdownField, options: string[]) => void;
  addCustomFieldDef: (name: string, type?: "text" | "select", options?: string[]) => void;
  removeCustomFieldDef: (id: string) => void;
  renameCustomFieldDef: (id: string, name: string) => void;
  addCustomFieldOption: (id: string, option: string) => void;
  removeCustomFieldOption: (id: string, idx: number) => void;
  editCustomFieldOption: (id: string, idx: number, val: string) => void;
  // Checkout form extra fields
  addSaleExtraFieldDef: (name: string) => void;
  removeSaleExtraFieldDef: (id: string) => void;
  // Sales filter requests
  addSalesFilterRequest: (name: string) => void;
  removeSalesFilterRequest: (name: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const LS_KEYS = {
  forklifts: "salesos_forklifts_v2",
  sales:     "salesos_sales_v2",
  inspMeta:  "salesos_insp_meta_v2",
  deleted:   "salesos_deleted_insp_v2",
  fieldCfg:  "salesos_field_cfg_v2",
} as const;

function lsLoad<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); if (v) return JSON.parse(v) as T; } catch {}
  return fallback;
}
function lsSave(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function stripImages<T extends InspectionRecord>(arr: T[]): T[] {
  return arr.map((r) => ({ ...r, images: [] as string[] }));
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ── Provider ──────────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [forklifts, setForklifts]     = useState<Forklift[]>(mockForklifts);
  const [sales, setSales]             = useState<Sale[]>(mockSales);
  const [inspections, setInspections] = useState<InspectionRecord[]>(mockInspections);
  const [deletedInspections, setDeletedInspections] = useState<DeletedInspectionRecord[]>([]);
  const [fieldConfig, setFieldConfig] = useState<FieldConfig>(DEFAULT_FIELD_CFG);

  useEffect(() => {
    setForklifts(lsLoad(LS_KEYS.forklifts, mockForklifts));
    setSales(lsLoad(LS_KEYS.sales, mockSales));

    const savedMeta = lsLoad<InspectionRecord[]>(LS_KEYS.inspMeta, []);
    if (savedMeta.length > 0) setInspections(savedMeta);

    const rawDeleted = lsLoad<DeletedInspectionRecord[]>(LS_KEYS.deleted, []);
    const now = Date.now();
    setDeletedInspections(rawDeleted.filter(r => now - new Date(r.deletedAt).getTime() < SEVEN_DAYS_MS));

    const savedCfg = lsLoad<FieldConfig>(LS_KEYS.fieldCfg, DEFAULT_FIELD_CFG);
    setFieldConfig({ ...DEFAULT_FIELD_CFG, ...savedCfg });

    setMounted(true);
  }, []);

  useEffect(() => { if (mounted) lsSave(LS_KEYS.forklifts, forklifts); }, [forklifts, mounted]);
  useEffect(() => { if (mounted) lsSave(LS_KEYS.sales, sales); }, [sales, mounted]);
  useEffect(() => { if (mounted) lsSave(LS_KEYS.inspMeta, stripImages(inspections)); }, [inspections, mounted]);
  useEffect(() => {
    if (mounted) lsSave(LS_KEYS.deleted, stripImages(deletedInspections as InspectionRecord[]).map(
      (r, i) => ({ ...r, deletedAt: (deletedInspections[i] as DeletedInspectionRecord).deletedAt })
    ));
  }, [deletedInspections, mounted]);
  useEffect(() => { if (mounted) lsSave(LS_KEYS.fieldCfg, fieldConfig); }, [fieldConfig, mounted]);

  // ── Forklift CRUD ─────────────────────────────────────────────────────────
  const addForklift    = useCallback((f: Forklift) => setForklifts(p => [f, ...p]), []);
  const deleteForklift = useCallback((id: string) => setForklifts(p => p.filter(f => f.id !== id)), []);

  // ── Sale CRUD ─────────────────────────────────────────────────────────────
  const addSale = useCallback((s: Sale) => {
    setSales(p => [s, ...p]);
    setForklifts(p => p.map(f => f.id === s.forklift_id ? { ...f, status: "ส่งมอบแล้ว" } : f));
  }, []);
  const deleteSale = useCallback((saleId: string) => {
    setSales(prev => {
      const sale = prev.find(s => s.id === saleId);
      if (sale) setForklifts(fls => fls.map(f => f.id === sale.forklift_id ? { ...f, status: "พร้อมขาย" } : f));
      return prev.filter(s => s.id !== saleId);
    });
  }, []);

  // ── Inspection CRUD ───────────────────────────────────────────────────────
  const addInspection = useCallback((r: InspectionRecord) => setInspections(p => [r, ...p]), []);
  const deleteInspection = useCallback((id: string) => {
    setInspections(prev => {
      const item = prev.find(r => r.id === id);
      if (item) setDeletedInspections(d => [{ ...item, deletedAt: new Date().toISOString() }, ...d]);
      return prev.filter(r => r.id !== id);
    });
  }, []);
  const restoreInspection = useCallback((id: string) => {
    setDeletedInspections(prev => {
      const item = prev.find(r => r.id === id);
      if (item) {
        const { deletedAt: _dt, ...record } = item;
        setInspections(ins => [record, ...ins]);
      }
      return prev.filter(r => r.id !== id);
    });
  }, []);
  const purgeInspection = useCallback((id: string) => {
    setDeletedInspections(p => p.filter(r => r.id !== id));
  }, []);

  // ── Stock field config CRUD ───────────────────────────────────────────────
  const updateFieldOptions = useCallback((field: DropdownField, options: string[]) => {
    setFieldConfig(prev => ({ ...prev, [field]: options }));
  }, []);
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
        const opts = [...(d.options ?? [])];
        opts[idx] = val.trim();
        return { ...d, options: opts };
      }),
    }));
  }, []);

  // ── Checkout extra field CRUD ─────────────────────────────────────────────
  const addSaleExtraFieldDef = useCallback((name: string) => {
    const def: CustomFieldDef = { id: `sef_${Date.now()}`, name: name.trim(), type: "text" };
    setFieldConfig(prev => ({ ...prev, saleExtraFieldDefs: [...prev.saleExtraFieldDefs, def] }));
  }, []);
  const removeSaleExtraFieldDef = useCallback((id: string) => {
    setFieldConfig(prev => ({ ...prev, saleExtraFieldDefs: prev.saleExtraFieldDefs.filter(d => d.id !== id) }));
  }, []);

  // ── Sales filter requests CRUD ────────────────────────────────────────────
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

  return (
    <AppContext.Provider value={{
      forklifts, sales, inspections, deletedInspections, fieldConfig,
      addForklift, deleteForklift,
      addSale, deleteSale,
      addInspection, deleteInspection, restoreInspection, purgeInspection,
      updateFieldOptions, addCustomFieldDef, removeCustomFieldDef, renameCustomFieldDef,
      addCustomFieldOption, removeCustomFieldOption, editCustomFieldOption,
      addSaleExtraFieldDef, removeSaleExtraFieldDef,
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
