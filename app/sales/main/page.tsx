"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp, LogOut, X, CheckCircle, AlertCircle,
  Search, Fuel, Zap, Filter, ChevronRight, Target,
  Package, Trash2, History, RotateCcw, Pencil, Check, Camera,
  SlidersHorizontal, ImageOff, ZoomIn, ChevronLeft, Plus, ClipboardList,
  Settings, ChevronDown, Type, ListOrdered, ArrowLeft
} from "lucide-react";
import { PROVINCES } from "@/lib/mockData";
import { Forklift, PaymentType, CustomerType, Sale } from "@/lib/types";
import { useApp } from "@/lib/AppContext";

const PAYMENT_TYPES: PaymentType[] = ["เงินสด", "ไฟแนนซ์"];

const STATUS_BADGE: Record<string, string> = {
  "พร้อมขาย":   "bg-emerald-100 text-emerald-700 border-emerald-200",
  "จองแล้ว":    "bg-amber-100 text-amber-700 border-amber-200",
  "ส่งมอบแล้ว": "bg-slate-100 text-slate-600 border-slate-200",
};

const emptyCheckout = {
  customer_name: "", customer_tel: "",
  customer_type: "" as CustomerType | "",
  province: "", payment_type: "" as PaymentType | "",
  finance_company: "", actual_sale: "", deposit: "",
  delivery_date: "", remark: "",
};

type SaleInlineStep = "name" | "type" | "options" | null;

// Labels for the standard configurable dropdowns in the sales settings modal
const SALE_FIELD_LABELS: Record<string, string> = {
  customerTypes: "ประเภทลูกค้า",
  financeCompanies: "บริษัทไฟแนนซ์",
};
type SaleDropdown = "customerTypes" | "financeCompanies";

export default function SalesMain() {
  const router = useRouter();
  const {
    forklifts, sales, addSale, deleteSale, inspections, fieldConfig,
    updateFieldOptions,
    addSaleExtraFieldDef, removeSaleExtraFieldDef, renameSaleExtraFieldDef,
    addSaleExtraFieldOption, removeSaleExtraFieldOption, editSaleExtraFieldOption,
    addSalesFilterRequest, removeSalesFilterRequest,
  } = useApp();

  const [salesUser, setSalesUser] = useState<{ name: string; target_monthly: number } | null>(null);
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Forklift | null>(null);
  const [form, setForm]           = useState(emptyCheckout);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [undoToast, setUndoToast]         = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput]     = useState("");

  // Cascade filter
  const [showFilter, setShowFilter] = useState(false);
  const [fBrand, setFBrand]       = useState("");
  const [fModel, setFModel]       = useState("");
  const [fFuel, setFFuel]         = useState("");
  const [fCapacity, setFCapacity] = useState("");
  const [fHeight, setFHeight]     = useState("");
  const [extraFilterVals, setExtraFilterVals] = useState<Record<string, string>>({});
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");

  // Checkout custom fields
  const [saleCustomVals, setSaleCustomVals]   = useState<Record<string, string>>({});
  const [lightboxIdx, setLightboxIdx]         = useState<number | null>(null);

  // ── Settings modal state ───────────────────────────────────────────────────
  const [showSettings, setShowSettings]         = useState(false);
  const [editingSaleField, setEditingSaleField] = useState<SaleDropdown | null>(null);
  const [sNewOpt, setSNewOpt]                   = useState("");
  const [sEditOpt, setSEditOpt]                 = useState<{ idx: number; val: string } | null>(null);
  // saleExtraFieldDefs management
  const [expandedSefId, setExpandedSefId] = useState<string | null>(null);
  const [editingSefId, setEditingSefId]   = useState<string | null>(null);
  const [editingSefVal, setEditingSefVal] = useState("");
  const [sefNewOpt, setSefNewOpt]         = useState("");
  const [sefEditOpt, setSefEditOpt]       = useState<{ idx: number; val: string } | null>(null);
  // Multi-step wizard for adding saleExtraFieldDef
  const [sefStep, setSefStep]         = useState<SaleInlineStep>(null);
  const [sefName, setSefName]         = useState("");
  const [sefType, setSefType]         = useState<"text" | "select">("text");
  const [sefOptions, setSefOptions]   = useState<string[]>([]);
  const [sefOptInput, setSefOptInput] = useState("");

  useEffect(() => {
    const u = sessionStorage.getItem("sales_user");
    if (!u) router.push("/sales/login");
    else setSalesUser(JSON.parse(u));
  }, [router]);

  const available = forklifts.filter(f => f.status === "พร้อมขาย");
  const brands     = [...new Set(available.map(f => f.brand))].sort();
  const models     = [...new Set(available.filter(f => !fBrand || f.brand === fBrand).map(f => f.model))].sort();
  const fuels      = [...new Set(available.map(f => f.fuel))].sort();
  const capacities = [...new Set(available.filter(f => (!fBrand || f.brand === fBrand) && (!fModel || f.model === fModel)).map(f => f.capacity).filter(Boolean))].sort();
  const heights    = [...new Set(available.filter(f => (!fBrand || f.brand === fBrand) && (!fModel || f.model === fModel)).map(f => f.height).filter(Boolean))].sort();
  const hasFilter  = !!(fBrand || fModel || fFuel || fCapacity || fHeight || search || Object.values(extraFilterVals).some(Boolean));

  const filtered = available.filter(f => {
    const q = search.toLowerCase();
    const base =
      (!q || f.unit_no.toLowerCase().includes(q) || f.brand.toLowerCase().includes(q) || f.model.toLowerCase().includes(q)) &&
      (!fBrand || f.brand === fBrand) && (!fModel || f.model === fModel) &&
      (!fFuel || f.fuel === fFuel) && (!fCapacity || f.capacity === fCapacity) && (!fHeight || f.height === fHeight);
    const extra = Object.values(extraFilterVals).every((val) => {
      if (!val.trim()) return true;
      return Object.values(f).join(" ").toLowerCase().includes(val.toLowerCase());
    });
    return base && extra;
  });

  const clearFilters = () => { setFBrand(""); setFModel(""); setFFuel(""); setFCapacity(""); setFHeight(""); setSearch(""); setExtraFilterVals({}); };
  const mySales = salesUser ? sales.filter(s => s.sales_staff === salesUser.name) : [];

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_name.trim()) e.customer_name = "กรุณากรอกชื่อลูกค้า";
    if (!form.customer_tel.trim()) e.customer_tel = "กรุณากรอกเบอร์โทร";
    if (!form.customer_type) e.customer_type = "กรุณาเลือกประเภทลูกค้า";
    if (!form.province) e.province = "กรุณาเลือกจังหวัด";
    if (!form.payment_type) e.payment_type = "กรุณาเลือกประเภทการชำระ";
    if (form.payment_type === "ไฟแนนซ์" && !form.finance_company) e.finance_company = "กรุณาเลือกบริษัทไฟแนนซ์";
    if (!form.actual_sale || isNaN(Number(form.actual_sale))) e.actual_sale = "กรุณากรอกราคาขาย";
    if (!form.delivery_date) e.delivery_date = "กรุณาระบุวันส่งมอบ";
    return e;
  };

  const handleSell = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const customFields: Record<string, string> = {};
    fieldConfig.saleExtraFieldDefs.forEach(def => {
      if (saleCustomVals[def.id]?.trim()) customFields[def.name] = saleCustomVals[def.id].trim();
    });
    const newSale: Sale = {
      id: `sale_${Date.now()}`,
      forklift_id: selected!.id, forklift_unit_no: selected!.unit_no,
      forklift_brand: selected!.brand, forklift_model: selected!.model,
      sales_staff: salesUser?.name ?? "",
      customer_name: form.customer_name, customer_tel: form.customer_tel,
      customer_type: form.customer_type as CustomerType, province: form.province,
      payment_type: form.payment_type as PaymentType,
      finance_company: form.finance_company || undefined,
      actual_sale: Number(form.actual_sale), deposit: Number(form.deposit) || 0,
      delivery_date: form.delivery_date, remark: form.remark || undefined,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
      created_at: new Date().toISOString().slice(0, 10),
    };
    addSale(newSale); setSubmitted(true);
    setTimeout(() => { setSelected(null); setForm(emptyCheckout); setErrors({}); setSaleCustomVals({}); setSubmitted(false); }, 3000);
  };

  const handleUpdateTarget = () => {
    const n = Number(targetInput.replace(/,/g, ""));
    if (!isNaN(n) && n > 0 && salesUser) {
      const updated = { ...salesUser, target_monthly: n };
      setSalesUser(updated); sessionStorage.setItem("sales_user", JSON.stringify(updated));
    }
    setEditingTarget(false);
  };

  const handleDeleteSale = (saleId: string) => {
    const sale = sales.find(s => s.id === saleId);
    deleteSale(saleId); setDeleteConfirm(null);
    if (sale) { setUndoToast(`ลบรายการขาย ${sale.forklift_unit_no} แล้ว — รถกลับสู่สต็อก`); setTimeout(() => setUndoToast(null), 4000); }
  };

  const fmt = (n: number) => n.toLocaleString("th-TH");
  const selectedPhotos = selected ? inspections.filter(r => r.unit_no === selected.unit_no).flatMap(r => r.images) : [];

  // Settings — standard dropdown handlers
  const saveStdOption = () => {
    if (!editingSaleField || !sNewOpt.trim()) return;
    updateFieldOptions(editingSaleField, [...fieldConfig[editingSaleField], sNewOpt.trim()]);
    setSNewOpt("");
  };
  const deleteStdOption = (field: SaleDropdown, idx: number) => {
    updateFieldOptions(field, fieldConfig[field].filter((_, i) => i !== idx));
    if (sEditOpt?.idx === idx) setSEditOpt(null);
  };
  const saveStdEditOption = () => {
    if (!editingSaleField || !sEditOpt?.val.trim()) return;
    const updated = [...fieldConfig[editingSaleField]];
    updated[sEditOpt.idx] = sEditOpt.val.trim();
    updateFieldOptions(editingSaleField, updated);
    setSEditOpt(null);
  };

  // Wizard helpers
  const resetSefWizard = () => { setSefStep(null); setSefName(""); setSefType("text"); setSefOptions([]); setSefOptInput(""); };
  const addSefOption = () => { if (!sefOptInput.trim()) return; setSefOptions(p => [...p, sefOptInput.trim()]); setSefOptInput(""); };
  const commitSef = () => {
    if (!sefName.trim()) return;
    addSaleExtraFieldDef(sefName, sefType, sefType === "select" ? sefOptions : []);
    resetSefWizard();
  };

  // Filter request helpers
  const confirmAddFilter = () => {
    if (!newFilterName.trim()) return;
    addSalesFilterRequest(newFilterName.trim()); setNewFilterName(""); setShowAddFilter(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {undoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2.5">
          <RotateCcw className="w-4 h-4 text-emerald-400" />{undoToast}
        </div>
      )}

      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-blue-700 rounded-xl p-2">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">ทีมขาย</p>
              <p className="text-slate-500 text-xs">{salesUser?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-indigo-200">
              <Settings className="w-4 h-4" /><span className="hidden sm:inline">จัดการตัวเลือก</span>
            </button>
            <button onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-indigo-200">
              <History className="w-4 h-4" /><span className="hidden sm:inline">ประวัติ ({mySales.length})</span>
            </button>
            <button onClick={() => { sessionStorage.removeItem("sales_user"); router.push("/sales/login"); }}
              className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Stats Banner */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-800 rounded-2xl p-5 text-white relative overflow-hidden shadow-lg shadow-indigo-200">
          <div className="absolute right-0 top-0 w-48 h-full bg-white/5 rounded-l-full" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3"><Package className="w-7 h-7 text-white" /></div>
              <div>
                <p className="text-indigo-200 text-sm font-medium">สต็อกพร้อมขาย</p>
                <p className="text-4xl font-bold leading-tight">{available.length} <span className="text-lg font-semibold text-indigo-300">คัน</span></p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="flex items-center gap-2 justify-end mb-1">
                <Target className="w-4 h-4 text-indigo-300" />
                <p className="text-indigo-200 text-sm font-medium">เป้าหมายเดือนนี้</p>
              </div>
              {editingTarget ? (
                <div className="flex items-center gap-2">
                  <input type="number" value={targetInput} onChange={e => setTargetInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleUpdateTarget(); if (e.key === "Escape") setEditingTarget(false); }} autoFocus
                    className="w-32 text-right bg-white/20 border border-white/30 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50" placeholder="ตั้งเป้า..." />
                  <button onClick={handleUpdateTarget} className="bg-white/20 hover:bg-white/30 text-white rounded-lg p-1.5"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingTarget(false)} className="bg-white/10 text-white/70 rounded-lg p-1.5"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2 justify-end">
                  <p className="text-2xl font-bold">฿{fmt(salesUser?.target_monthly ?? 0)}</p>
                  <button onClick={() => { setTargetInput(String(salesUser?.target_monthly ?? 0)); setEditingTarget(true); }}
                    className="bg-white/10 hover:bg-white/25 text-white/70 hover:text-white rounded-lg p-1.5 transition-all">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา หมายเลข / ยี่ห้อ / รุ่น..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-slate-800 placeholder:text-slate-400 transition-all shadow-sm" />
          </div>
          <button onClick={() => setShowFilter(!showFilter)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all shadow-sm ${showFilter || hasFilter ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:text-indigo-700"}`}>
            <SlidersHorizontal className="w-4 h-4" />ตัวกรองละเอียด
            {hasFilter && <span className="bg-white/30 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{[fBrand,fModel,fFuel,fCapacity,fHeight,...Object.values(extraFilterVals).filter(Boolean)].filter(Boolean).length}</span>}
          </button>
          {hasFilter && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-slate-500 hover:text-red-600 text-sm px-3 py-2.5 rounded-xl border border-slate-200 hover:border-red-200 hover:bg-red-50 transition-all bg-white shadow-sm">
              <X className="w-3.5 h-3.5" />ล้าง
            </button>
          )}
        </div>

        {/* Cascade filter panel */}
        {showFilter && (
          <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm p-5 flex flex-col gap-4">
            <div>
              <p className="text-xs font-semibold text-indigo-700 mb-3 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" />ตัวกรองมาตรฐาน</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: "ยี่ห้อ", val: fBrand, opts: brands, set: (v: string) => { setFBrand(v); setFModel(""); setFCapacity(""); setFHeight(""); } },
                  { label: "รุ่น",   val: fModel, opts: models, set: (v: string) => { setFModel(v); setFCapacity(""); setFHeight(""); } },
                  { label: "พิกัดยก", val: fCapacity, opts: capacities, set: setFCapacity },
                  { label: "ความสูงยก", val: fHeight, opts: heights, set: setFHeight },
                  { label: "เชื้อเพลิง", val: fFuel, opts: fuels, set: setFFuel },
                ].map(({ label, val, opts, set }) => (
                  <div key={label}>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                    <select value={val} onChange={e => set(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                      <option value="">ทั้งหมด</option>
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {(fieldConfig.salesFilterRequests.length > 0 || showAddFilter) && (
              <div className="border-t border-indigo-50 pt-4">
                <p className="text-xs font-semibold text-violet-700 mb-3 flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" />ตัวกรองที่ขอเพิ่ม
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {fieldConfig.salesFilterRequests.map(name => (
                    <div key={name} className="relative group">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">{name}</label>
                      <div className="flex items-center gap-1">
                        <input value={extraFilterVals[name] ?? ""} onChange={e => setExtraFilterVals(p => ({ ...p, [name]: e.target.value }))}
                          placeholder={`กรอก${name}...`}
                          className="flex-1 border border-violet-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800 placeholder:text-slate-400" />
                        <button onClick={() => { removeSalesFilterRequest(name); setExtraFilterVals(p => { const n = {...p}; delete n[name]; return n; }); }}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 pt-3">
              {showAddFilter ? (
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  <input autoFocus value={newFilterName} onChange={e => setNewFilterName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") confirmAddFilter(); if (e.key === "Escape") { setShowAddFilter(false); setNewFilterName(""); } }}
                    placeholder="ชื่อตัวกรองที่ต้องการ เช่น โลเคชั่น, ปีผลิต..."
                    className="flex-1 border border-dashed border-violet-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400" />
                  <button onClick={confirmAddFilter} disabled={!newFilterName.trim()}
                    className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />บันทึก
                  </button>
                  <button onClick={() => { setShowAddFilter(false); setNewFilterName(""); }}
                    className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-xl transition-all"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <button onClick={() => setShowAddFilter(true)}
                  className="flex items-center gap-1.5 text-violet-600 hover:text-violet-700 text-sm font-medium hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-all border border-dashed border-violet-200 hover:border-violet-300">
                  <Plus className="w-3.5 h-3.5" />เพิ่มตัวกรองที่ต้องการ
                </button>
              )}
            </div>
          </div>
        )}

        {/* Forklift Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-100">
              <Filter className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-semibold text-slate-500">ไม่มีสินค้าในระบบ</p>
              <p className="text-sm mt-1">{hasFilter ? "ลองเปลี่ยนตัวกรองการค้นหา" : "ยังไม่มีรถพร้อมขายในสต็อก"}</p>
            </div>
          )}
          {filtered.map(item => {
            const photos = inspections.filter(r => r.unit_no === item.unit_no).flatMap(r => r.images);
            return (
              <div key={item.id}
                onClick={() => { setSelected(item); setForm(emptyCheckout); setErrors({}); setSubmitted(false); setLightboxIdx(null); setSaleCustomVals({}); }}
                className="bg-white rounded-2xl shadow-sm hover:shadow-lg border border-slate-100 hover:border-indigo-200 transition-all cursor-pointer group overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-indigo-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-slate-800 text-base">{item.brand}</p>
                      <p className="text-sm text-slate-600 font-medium">{item.model}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.unit_no}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{item.status}</span>
                      {photos.length > 0 && <span className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full"><Camera className="w-3 h-3" />{photos.length} รูป</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-slate-600"><span className="text-slate-400">⚖</span>{item.capacity}</div>
                    <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-slate-600">
                      {item.fuel === "ไฟฟ้า" ? <Zap className="w-3 h-3 text-blue-500" /> : <Fuel className="w-3 h-3 text-orange-500" />}{item.fuel}
                    </div>
                  </div>
                  <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-2">
                    <div className="bg-red-50 border border-red-100 rounded-xl p-2.5"><p className="text-xs text-red-500 font-medium">ราคาทุน</p><p className="font-bold text-red-700 text-sm">฿{fmt(item.cost_price)}</p></div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2.5"><p className="text-xs text-indigo-500 font-medium">ราคาสต็อก</p><p className="font-bold text-indigo-700 text-sm">฿{fmt(item.stock_price)}</p></div>
                  </div>
                  <button className="w-full bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600 text-white text-sm font-bold py-2.5 rounded-xl transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 shadow-sm">
                    ปิดการขาย <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ── Checkout Modal ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">ปิดการขาย</h3>
                <p className="text-indigo-200 text-sm">{selected.unit_no} — {selected.brand} {selected.model}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/70 hover:text-white hover:bg-white/20 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-5">
              {submitted ? (
                <div className="flex flex-col items-center justify-center h-52 gap-4">
                  <div className="bg-emerald-100 rounded-full p-4"><CheckCircle className="w-12 h-12 text-emerald-600" /></div>
                  <div className="text-center"><p className="text-xl font-bold text-slate-800">ปิดการขายสำเร็จ!</p><p className="text-slate-500 text-sm mt-1">บันทึกการขายในระบบแล้ว</p></div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3"><p className="text-xs text-red-500 font-medium">ราคาทุน</p><p className="font-bold text-red-700">฿{fmt(selected.cost_price)}</p></div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3"><p className="text-xs text-indigo-500 font-medium">ราคาสต็อก</p><p className="font-bold text-indigo-700">฿{fmt(selected.stock_price)}</p></div>
                  </div>
                  {selectedPhotos.length > 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-indigo-500" />รูปตรวจรับรถ ({selectedPhotos.length} รูป)</p>
                      <div className="grid grid-cols-3 gap-2">
                        {selectedPhotos.map((img, i) => (
                          <button key={i} onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                            className="relative aspect-square rounded-xl overflow-hidden bg-slate-200 group hover:ring-2 hover:ring-indigo-400 transition-all">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center"><ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" /></div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2 text-slate-400">
                      <ImageOff className="w-4 h-4 flex-shrink-0" /><p className="text-xs">ยังไม่มีรูปตรวจรับสำหรับรถคันนี้</p>
                    </div>
                  )}
                  <form onSubmit={handleSell} className="flex flex-col gap-4">
                    <SField label="ชื่อลูกค้า *" error={errors.customer_name}><input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="ชื่อ-นามสกุล / ชื่อบริษัท" className={si(errors.customer_name)} /></SField>
                    <SField label="เบอร์โทร *" error={errors.customer_tel}><input value={form.customer_tel} onChange={e => setForm({ ...form, customer_tel: e.target.value })} placeholder="0XX-XXX-XXXX" className={si(errors.customer_tel)} /></SField>
                    <div className="grid grid-cols-2 gap-3">
                      <SField label="ประเภทลูกค้า *" error={errors.customer_type}>
                        <select value={form.customer_type} onChange={e => setForm({ ...form, customer_type: e.target.value as CustomerType })} className={ss(errors.customer_type)}>
                          <option value="">-- เลือก --</option>
                          {fieldConfig.customerTypes.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </SField>
                      <SField label="จังหวัด *" error={errors.province}>
                        <select value={form.province} onChange={e => setForm({ ...form, province: e.target.value })} className={ss(errors.province)}>
                          <option value="">-- เลือก --</option>
                          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </SField>
                    </div>
                    <SField label="ประเภทการชำระ *" error={errors.payment_type}>
                      <select value={form.payment_type} onChange={e => setForm({ ...form, payment_type: e.target.value as PaymentType, finance_company: "" })} className={ss(errors.payment_type)}>
                        <option value="">-- เลือก --</option>
                        {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </SField>
                    {form.payment_type === "ไฟแนนซ์" && (
                      <SField label="บริษัทไฟแนนซ์ *" error={errors.finance_company}>
                        <select value={form.finance_company} onChange={e => setForm({ ...form, finance_company: e.target.value })} className={ss(errors.finance_company)}>
                          <option value="">-- เลือกบริษัท --</option>
                          {fieldConfig.financeCompanies.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </SField>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <SField label="ราคาขายจริง (฿) *" error={errors.actual_sale}><input type="number" value={form.actual_sale} onChange={e => setForm({ ...form, actual_sale: e.target.value })} placeholder="บาท" className={si(errors.actual_sale)} /></SField>
                      <SField label="มัดจำ (฿)" error=""><input type="number" value={form.deposit} onChange={e => setForm({ ...form, deposit: e.target.value })} placeholder="บาท" className={si("")} /></SField>
                    </div>
                    <SField label="วันส่งมอบ *" error={errors.delivery_date}><input type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} className={si(errors.delivery_date)} /></SField>
                    <SField label="หมายเหตุ" error="">
                      <textarea value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} rows={2} placeholder="หมายเหตุเพิ่มเติม..."
                        className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-400 resize-none transition-all" />
                    </SField>
                    {/* Extra sale fields */}
                    {fieldConfig.saleExtraFieldDefs.length > 0 && (
                      <div className="border border-violet-100 rounded-2xl p-4 bg-violet-50/30">
                        <p className="text-xs font-semibold text-violet-700 mb-3 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5" />รายการที่เพิ่มเอง</p>
                        <div className="flex flex-col gap-3">
                          {fieldConfig.saleExtraFieldDefs.map(def => (
                            <SField key={def.id} label={`${def.name}${def.type === "select" ? " ▼" : ""}`} error="">
                              {def.type === "select" ? (
                                <select value={saleCustomVals[def.id] ?? ""} onChange={e => setSaleCustomVals(p => ({ ...p, [def.id]: e.target.value }))} className={ss("")}>
                                  <option value="">-- เลือก --</option>
                                  {(def.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              ) : (
                                <input value={saleCustomVals[def.id] ?? ""} onChange={e => setSaleCustomVals(p => ({ ...p, [def.id]: e.target.value }))} placeholder={`กรอก${def.name}...`} className={si("")} />
                              )}
                            </SField>
                          ))}
                        </div>
                      </div>
                    )}
                    {form.actual_sale && !isNaN(Number(form.actual_sale)) && Number(form.actual_sale) > 0 && (
                      <div className={`rounded-xl p-3.5 text-sm font-semibold flex items-center gap-2 ${Number(form.actual_sale) >= selected.cost_price ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-600"}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${Number(form.actual_sale) >= selected.cost_price ? "bg-emerald-500" : "bg-red-500"}`} />
                        กำไร: ฿{fmt(Number(form.actual_sale) - selected.cost_price)}{Number(form.actual_sale) < selected.cost_price && " — ราคาต่ำกว่าทุน!"}
                      </div>
                    )}
                    <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" />ยืนยันการขาย
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Lightbox ── */}
      {selected && lightboxIdx !== null && selectedPhotos.length > 0 && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setLightboxIdx(null)}>
          <button onClick={() => setLightboxIdx(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 rounded-full p-2"><X className="w-6 h-6" /></button>
          {lightboxIdx > 0 && <button onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3"><ChevronLeft className="w-6 h-6" /></button>}
          <div className="max-w-3xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedPhotos[lightboxIdx]} alt="" className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
          </div>
          {lightboxIdx < selectedPhotos.length - 1 && <button onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3"><ChevronRight className="w-6 h-6" /></button>}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">{lightboxIdx + 1} / {selectedPhotos.length}</p>
        </div>
      )}

      {/* ── Sales History Modal ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[82vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div><h3 className="text-base font-bold text-slate-800">ประวัติการขายของฉัน</h3><p className="text-xs text-slate-500 mt-0.5">{mySales.length} รายการ</p></div>
              <button onClick={() => { setShowHistory(false); setDeleteConfirm(null); }} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
            </div>
            {mySales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400"><History className="w-10 h-10 text-slate-300 mb-2" /><p className="text-sm">ยังไม่มีประวัติการขาย</p></div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
                {mySales.map(sale => (
                  <div key={sale.id} className="bg-slate-50 border border-slate-100 rounded-xl p-4 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-800 text-sm">{sale.forklift_unit_no}</p>
                          <p className="text-slate-600 text-sm">{sale.forklift_brand} {sale.forklift_model}</p>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 truncate">{sale.customer_name} · {sale.province}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sale.payment_type === "เงินสด" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{sale.payment_type}</span>
                          <span className="text-xs text-slate-500">{sale.created_at}</span>
                        </div>
                        {sale.custom_fields && Object.keys(sale.custom_fields).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {Object.entries(sale.custom_fields).map(([k, v]) => (
                              <span key={k} className="text-xs bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{k}: {v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-indigo-700">฿{sale.actual_sale.toLocaleString("th-TH")}</p>
                        {deleteConfirm === sale.id ? (
                          <div className="flex gap-1.5 mt-2 justify-end">
                            <button onClick={() => handleDeleteSale(sale.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Trash2 className="w-3 h-3" />ลบ + คืนสต็อก</button>
                            <button onClick={() => setDeleteConfirm(null)} className="bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-1.5 rounded-lg">ยกเลิก</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(sale.id)} className="mt-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all ml-auto block"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Settings Modal (Sales) ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="w-full max-w-2xl shadow-2xl"
            style={{ height: "88vh", overflowY: "scroll", borderRadius: "24px", backgroundColor: "white" }}>

            {/* Sticky header */}
            <div style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "white", borderBottom: "1px solid #f1f5f9" }}
              className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="bg-indigo-100 rounded-xl p-2"><Settings className="w-4 h-4 text-indigo-600" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">จัดการตัวเลือกช่องกรอก (ฝ่ายขาย)</h3>
                  <p className="text-xs text-slate-500">แก้ไข เพิ่ม หรือลบตัวเลือกในแต่ละช่อง</p>
                </div>
              </div>
              <button onClick={() => { setShowSettings(false); setEditingSaleField(null); setExpandedSefId(null); resetSefWizard(); }}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 flex flex-col gap-4">

              {/* Standard dropdown fields */}
              {(Object.keys(SALE_FIELD_LABELS) as SaleDropdown[]).map(field => (
                <div key={field} className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button onClick={() => setEditingSaleField(editingSaleField === field ? null : field)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <span className="font-semibold text-slate-800 text-sm">{SALE_FIELD_LABELS[field]}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{fieldConfig[field].length} ตัวเลือก</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${editingSaleField === field ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {editingSaleField === field && (
                    <div className="p-4 flex flex-col gap-2 border-t border-slate-100">
                      {fieldConfig[field].map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          {sEditOpt?.idx === idx ? (
                            <>
                              <input autoFocus value={sEditOpt.val} onChange={e => setSEditOpt({ idx, val: e.target.value })}
                                onKeyDown={e => { if (e.key === "Enter") saveStdEditOption(); if (e.key === "Escape") setSEditOpt(null); }}
                                className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                              <button onClick={saveStdEditOption} className="bg-indigo-600 hover:bg-indigo-700 text-white p-1.5 rounded-lg"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setSEditOpt(null)} className="bg-slate-200 text-slate-700 p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5">{opt}</span>
                              <button onClick={() => setSEditOpt({ idx, val: opt })} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteStdOption(field, idx)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-100">
                        <input value={sNewOpt} onChange={e => setSNewOpt(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveStdOption(); } }}
                          placeholder="พิมพ์ตัวเลือกใหม่..."
                          className="flex-1 border border-dashed border-emerald-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-slate-400" />
                        <button onClick={saveStdOption} disabled={!sNewOpt.trim()}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" />เพิ่ม
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Sale extra field defs (checkout form) */}
              <div className="border border-violet-100 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-violet-50 flex items-center justify-between">
                  <span className="font-semibold text-violet-800 text-sm">รายการบันทึกเพิ่มในใบขาย</span>
                  <span className="text-xs text-violet-500">{fieldConfig.saleExtraFieldDefs.length} รายการ</span>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {fieldConfig.saleExtraFieldDefs.length === 0 && sefStep === null && (
                    <p className="text-xs text-slate-400 text-center py-2">ยังไม่มีรายการเพิ่มเติม</p>
                  )}
                  {fieldConfig.saleExtraFieldDefs.map(def => (
                    <div key={def.id} className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${def.type === "select" ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-600"}`}>
                          {def.type === "select" ? "ตัวเลือก" : "ข้อความ"}
                        </span>
                        {editingSefId === def.id ? (
                          <>
                            <input autoFocus value={editingSefVal} onChange={e => setEditingSefVal(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && editingSefVal.trim()) { renameSaleExtraFieldDef(def.id, editingSefVal); setEditingSefId(null); } if (e.key === "Escape") setEditingSefId(null); }}
                              className="flex-1 border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            <button onClick={() => { if (editingSefVal.trim()) renameSaleExtraFieldDef(def.id, editingSefVal); setEditingSefId(null); }} className="text-white bg-indigo-600 hover:bg-indigo-700 p-1.5 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingSefId(null)} className="text-slate-600 bg-slate-200 p-1.5 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-semibold text-slate-800">{def.name}</span>
                            <button onClick={() => { setEditingSefId(def.id); setEditingSefVal(def.name); }} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                            {def.type === "select" && (
                              <button onClick={() => setExpandedSefId(expandedSefId === def.id ? null : def.id)} className="text-slate-400 hover:text-violet-600 hover:bg-violet-50 p-1.5 rounded-lg transition-all">
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedSefId === def.id ? "rotate-180" : ""}`} />
                              </button>
                            )}
                            <button onClick={() => removeSaleExtraFieldDef(def.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                      {def.type === "select" && expandedSefId === def.id && (
                        <div className="p-3 border-t border-slate-100 flex flex-col gap-2">
                          {(def.options ?? []).length === 0 && <p className="text-xs text-slate-400 text-center py-1">ยังไม่มีตัวเลือก</p>}
                          {(def.options ?? []).map((opt, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              {sefEditOpt?.idx === idx ? (
                                <>
                                  <input autoFocus value={sefEditOpt.val} onChange={e => setSefEditOpt({ idx, val: e.target.value })}
                                    onKeyDown={e => { if (e.key === "Enter" && sefEditOpt.val.trim()) { editSaleExtraFieldOption(def.id, idx, sefEditOpt.val); setSefEditOpt(null); } if (e.key === "Escape") setSefEditOpt(null); }}
                                    className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                  <button onClick={() => { if (sefEditOpt.val.trim()) editSaleExtraFieldOption(def.id, idx, sefEditOpt.val); setSefEditOpt(null); }} className="bg-indigo-600 text-white p-1.5 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setSefEditOpt(null)} className="bg-slate-200 text-slate-700 p-1.5 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5">{opt}</span>
                                  <button onClick={() => setSefEditOpt({ idx, val: opt })} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => removeSaleExtraFieldOption(def.id, idx)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            <input value={sefNewOpt} onChange={e => setSefNewOpt(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && sefNewOpt.trim()) { addSaleExtraFieldOption(def.id, sefNewOpt); setSefNewOpt(""); } }}
                              placeholder="พิมพ์ตัวเลือกใหม่..."
                              className="flex-1 border border-dashed border-violet-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400" />
                            <button onClick={() => { if (sefNewOpt.trim()) { addSaleExtraFieldOption(def.id, sefNewOpt); setSefNewOpt(""); } }} disabled={!sefNewOpt.trim()}
                              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1">
                              <Plus className="w-3.5 h-3.5" />เพิ่ม
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Multi-step wizard */}
                  {sefStep === null && (
                    <button onClick={() => setSefStep("name")}
                      className="w-full border-2 border-dashed border-violet-200 hover:border-violet-400 bg-violet-50/50 hover:bg-violet-50 text-violet-600 text-sm font-semibold rounded-xl py-2.5 transition-all flex items-center justify-center gap-1.5">
                      <Plus className="w-4 h-4" />เพิ่มรายการบันทึกใหม่
                    </button>
                  )}
                  {sefStep === "name" && (
                    <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-4 flex flex-col gap-3">
                      <p className="text-xs font-semibold text-violet-700">ขั้น 1 / 2 — ตั้งชื่อ</p>
                      <div className="flex items-center gap-2">
                        <input autoFocus value={sefName} onChange={e => setSefName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && sefName.trim()) setSefStep("type"); if (e.key === "Escape") resetSefWizard(); }}
                          placeholder="ชื่อรายการ เช่น เลขสัญญา, ผู้ค้ำ..."
                          className="flex-1 border border-violet-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800 placeholder:text-slate-400" />
                        <button onClick={() => { if (sefName.trim()) setSefStep("type"); }} disabled={!sefName.trim()}
                          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-semibold">ต่อไป →</button>
                        <button onClick={resetSefWizard} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2.5 rounded-xl"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                  {sefStep === "type" && (
                    <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSefStep("name")} className="text-violet-500 hover:text-violet-700 hover:bg-violet-100 p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></button>
                        <p className="text-xs font-semibold text-violet-700">&quot;{sefName}&quot; เป็นช่องแบบไหน?</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => { setSefType("text"); addSaleExtraFieldDef(sefName, "text"); resetSefWizard(); }}
                          className="flex flex-col items-center gap-2 border-2 border-slate-200 hover:border-emerald-400 bg-white hover:bg-emerald-50 rounded-2xl p-4 transition-all group">
                          <div className="bg-slate-100 group-hover:bg-emerald-100 rounded-xl p-2.5"><Type className="w-5 h-5 text-slate-500 group-hover:text-emerald-600" /></div>
                          <p className="text-sm font-bold text-slate-700 group-hover:text-emerald-700">ช่องพิมพ์</p>
                          <p className="text-xs text-slate-400 text-center">กรอกอิสระ</p>
                        </button>
                        <button onClick={() => { setSefType("select"); setSefStep("options"); }}
                          className="flex flex-col items-center gap-2 border-2 border-slate-200 hover:border-violet-400 bg-white hover:bg-violet-50 rounded-2xl p-4 transition-all group">
                          <div className="bg-slate-100 group-hover:bg-violet-100 rounded-xl p-2.5"><ListOrdered className="w-5 h-5 text-slate-500 group-hover:text-violet-600" /></div>
                          <p className="text-sm font-bold text-slate-700 group-hover:text-violet-700">ช่องตัวเลือก</p>
                          <p className="text-xs text-slate-400 text-center">กดเลือกจากรายการ</p>
                        </button>
                      </div>
                    </div>
                  )}
                  {sefStep === "options" && (
                    <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSefStep("type")} className="text-violet-500 hover:text-violet-700 hover:bg-violet-100 p-1.5 rounded-lg"><ArrowLeft className="w-4 h-4" /></button>
                        <p className="text-xs font-semibold text-violet-700">เพิ่มตัวเลือกสำหรับ &quot;{sefName}&quot;</p>
                      </div>
                      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                        {sefOptions.length === 0 && <p className="text-xs text-slate-400 text-center py-2">ยังไม่มีตัวเลือก</p>}
                        {sefOptions.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                            <span className="flex-1 text-sm text-slate-700">{opt}</span>
                            <button onClick={() => setSefOptions(p => p.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input value={sefOptInput} onChange={e => setSefOptInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSefOption(); } }}
                          placeholder="พิมพ์ตัวเลือก..."
                          className="flex-1 border border-dashed border-violet-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400 bg-white" />
                        <button onClick={addSefOption} disabled={!sefOptInput.trim()}
                          className="bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-700 px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" />เพิ่ม
                        </button>
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-violet-100">
                        <button onClick={resetSefWizard} className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2 rounded-xl text-sm font-semibold">ยกเลิก</button>
                        <button onClick={commitSef} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
                          <Check className="w-4 h-4" />บันทึก ({sefOptions.length} ตัวเลือก)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sales filter requests */}
              <div className="border border-indigo-100 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-indigo-50 flex items-center justify-between">
                  <span className="font-semibold text-indigo-800 text-sm">ตัวกรองที่ขอเพิ่ม</span>
                  <span className="text-xs text-indigo-500">{fieldConfig.salesFilterRequests.length} ตัวกรอง</span>
                </div>
                <div className="p-4 flex flex-col gap-2">
                  {fieldConfig.salesFilterRequests.length === 0 && <p className="text-xs text-slate-400 text-center py-2">ยังไม่มีตัวกรองที่ขอเพิ่ม</p>}
                  {fieldConfig.salesFilterRequests.map(name => (
                    <div key={name} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm text-slate-700">{name}</span>
                      <button onClick={() => removeSalesFilterRequest(name)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SField({ label, error, children }: { label: string; error: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0" />{error}</p>}
    </div>
  );
}
function si(error: string) {
  return `w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${error ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300 bg-white"}`;
}
function ss(error: string) {
  return `w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${error ? "border-red-300" : "border-slate-200 hover:border-slate-300"}`;
}
