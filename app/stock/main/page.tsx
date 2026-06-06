"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Plus, LogOut, CheckCircle, AlertCircle, List, X,
  TrendingUp, Boxes, Trash2, Settings, Pencil, Check, ChevronDown,
  Type, ListOrdered, ArrowLeft
} from "lucide-react";
import { Forklift } from "@/lib/types";
import { useApp, FieldConfig } from "@/lib/AppContext";

const STATUS_BADGE: Record<string, string> = {
  "พร้อมขาย":   "bg-emerald-100 text-emerald-700 border-emerald-200",
  "จองแล้ว":    "bg-amber-100 text-amber-700 border-amber-200",
  "ส่งมอบแล้ว": "bg-slate-100 text-slate-600 border-slate-200",
  "ซ่อมบำรุง":  "bg-red-100 text-red-700 border-red-200",
  "รอตรวจสอบ": "bg-blue-100 text-blue-700 border-blue-200",
};

type DropdownField = keyof Omit<FieldConfig, "customFieldDefs" | "saleExtraFieldDefs" | "salesFilterRequests">;

const FIELD_LABELS: Record<DropdownField, string> = {
  brands: "ยี่ห้อ",
  vehicleGroups: "กลุ่มรถ",
  fuelTypes: "เชื้อเพลิง",
  controlTypes: "ประเภทคอนโทรล",
  poStatuses: "สถานะสั่งซื้อ",
  locations: "โลเคชั่น",
  stockStatuses: "สถานะ Stock",
};

const emptyForm = {
  unit_no: "", brand: "", model: "", year: "", vehicle_group: "",
  capacity: "", capacity_kg: "", height: "", fuel: "", control_type: "", fork_length: "",
  pi_no: "", po_status: "", received_date: "", location: "",
  cost_price: "", stock_price: "", install_date: "", install_cost: "", attachments: "",
  status: "พร้อมขาย",
};

// Inline add step machine
type InlineStep = "name" | "type" | "options" | null;

export default function StockMain() {
  const router = useRouter();
  const {
    forklifts, addForklift, deleteForklift,
    fieldConfig, updateFieldOptions,
    addCustomFieldDef, removeCustomFieldDef, renameCustomFieldDef,
    addCustomFieldOption, removeCustomFieldOption, editCustomFieldOption,
  } = useApp();

  const [username, setUsername]     = useState("");
  const [form, setForm]             = useState(emptyForm);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [submitted, setSubmitted]   = useState(false);
  const [showList, setShowList]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showSettings, setShowSettings]   = useState(false);

  // Settings modal state
  const [editingField, setEditingField]   = useState<DropdownField | null>(null);
  const [newOption, setNewOption]         = useState("");
  const [editingOption, setEditingOption] = useState<{ idx: number; val: string } | null>(null);
  const [editingCfId, setEditingCfId]     = useState<string | null>(null);
  const [editingCfVal, setEditingCfVal]   = useState("");
  const [expandedCfId, setExpandedCfId]   = useState<string | null>(null);
  const [cfNewOption, setCfNewOption]     = useState("");
  const [cfEditingOpt, setCfEditingOpt]   = useState<{ idx: number; val: string } | null>(null);

  // Inline add (multi-step)
  const [inlineStep, setInlineStep]       = useState<InlineStep>(null);
  const [inlineName, setInlineName]       = useState("");
  const [inlineType, setInlineType]       = useState<"text" | "select">("text");
  const [inlineOptions, setInlineOptions] = useState<string[]>([]);
  const [inlineOptInput, setInlineOptInput] = useState("");

  useEffect(() => {
    const u = sessionStorage.getItem("stock_user");
    if (!u) router.push("/stock/login");
    else setUsername(JSON.parse(u).name);
  }, [router]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.unit_no.trim()) e.unit_no = "กรุณากรอกหมายเลขรถ";
    if (!form.brand) e.brand = "กรุณาเลือกยี่ห้อ";
    if (!form.model.trim()) e.model = "กรุณากรอกรุ่น";
    if (!form.fuel) e.fuel = "กรุณาเลือกเชื้อเพลิง";
    if (!form.cost_price || isNaN(Number(form.cost_price))) e.cost_price = "กรุณากรอกราคาทุน";
    if (!form.stock_price || isNaN(Number(form.stock_price))) e.stock_price = "กรุณากรอกราคาสต็อก";
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const newItem: Forklift = {
      id: String(Date.now()),
      unit_no: form.unit_no.toUpperCase(),
      brand: form.brand, model: form.model, year: form.year || undefined,
      vehicle_group: form.vehicle_group || undefined,
      capacity: form.capacity, capacity_kg: form.capacity_kg || undefined,
      height: form.height, fuel: form.fuel,
      control_type: form.control_type || undefined,
      fork_length: form.fork_length || undefined,
      pi_no: form.pi_no || undefined,
      po_status: form.po_status || undefined,
      received_date: form.received_date || undefined,
      location: form.location || undefined,
      cost_price: Number(form.cost_price),
      stock_price: Number(form.stock_price),
      install_date: form.install_date || undefined,
      install_cost: form.install_cost ? Number(form.install_cost) : undefined,
      attachments: form.attachments || undefined,
      status: form.status,
      created_at: new Date().toISOString().slice(0, 10),
      custom_fields: Object.keys(customValues).length > 0 ? { ...customValues } : undefined,
    };
    addForklift(newItem);
    setForm(emptyForm); setCustomValues({}); setErrors({});
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleLogout = () => { sessionStorage.removeItem("stock_user"); router.push("/stock/login"); };

  const available = forklifts.filter(f => f.status === "พร้อมขาย").length;
  const booked    = forklifts.filter(f => f.status === "จองแล้ว").length;
  const delivered = forklifts.filter(f => f.status === "ส่งมอบแล้ว").length;

  // Settings — standard dropdown handlers
  const saveOption = () => {
    if (!editingField || !newOption.trim()) return;
    updateFieldOptions(editingField, [...fieldConfig[editingField], newOption.trim()]);
    setNewOption("");
  };
  const deleteOption = (field: DropdownField, idx: number) => {
    updateFieldOptions(field, fieldConfig[field].filter((_, i) => i !== idx));
    if (editingOption?.idx === idx) setEditingOption(null);
  };
  const saveEditOption = () => {
    if (!editingField || !editingOption || !editingOption.val.trim()) return;
    const updated = [...fieldConfig[editingField]];
    updated[editingOption.idx] = editingOption.val.trim();
    updateFieldOptions(editingField, updated);
    setEditingOption(null);
  };

  // Inline add — helpers
  const resetInline = () => {
    setInlineStep(null); setInlineName(""); setInlineType("text");
    setInlineOptions([]); setInlineOptInput("");
  };
  const addInlineOption = () => {
    if (!inlineOptInput.trim()) return;
    setInlineOptions(p => [...p, inlineOptInput.trim()]);
    setInlineOptInput("");
  };
  const commitInlineField = () => {
    if (!inlineName.trim()) return;
    addCustomFieldDef(inlineName, inlineType, inlineType === "select" ? inlineOptions : []);
    resetInline();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-400 to-green-600 rounded-xl p-2">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">ฝ่ายสต็อก</p>
              <p className="text-slate-500 text-xs">{username}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-violet-700 hover:bg-violet-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-violet-200">
              <Settings className="w-4 h-4" /><span className="hidden sm:inline">จัดการตัวเลือก</span>
            </button>
            <button onClick={() => setShowList(true)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-emerald-200">
              <List className="w-4 h-4" /><span className="hidden sm:inline">สต็อก ({forklifts.length})</span>
            </button>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="พร้อมขาย"   value={available} icon={<TrendingUp className="w-4 h-4" />} color="text-emerald-700" bg="bg-emerald-50 border-emerald-100" iconBg="bg-emerald-100 text-emerald-600" />
          <StatCard label="จองแล้ว"    value={booked}    icon={<Boxes className="w-4 h-4" />}       color="text-amber-700"   bg="bg-amber-50 border-amber-100"   iconBg="bg-amber-100 text-amber-600" />
          <StatCard label="ส่งมอบแล้ว" value={delivered}  icon={<CheckCircle className="w-4 h-4" />} color="text-slate-700"   bg="bg-slate-100 border-slate-200" iconBg="bg-slate-200 text-slate-500" />
        </div>

        {/* Add Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <div className="bg-emerald-100 rounded-lg p-1.5"><Plus className="w-4 h-4 text-emerald-600" /></div>
            <h2 className="text-base font-bold text-slate-800">เพิ่มรถใหม่เข้าสต็อก</h2>
          </div>
          <div className="p-6">
            {submitted && (
              <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <p className="text-emerald-800 text-sm font-semibold">เพิ่มรถเข้าสต็อกเรียบร้อยแล้ว!</p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">

              <Section title="ข้อมูลพื้นฐาน">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FF label="หมายเลขรถ *" error={errors.unit_no}>
                    <input value={form.unit_no} onChange={e => setForm({ ...form, unit_no: e.target.value })} placeholder="เช่น HEL-013" className={ic(errors.unit_no)} />
                  </FF>
                  <FF label="ยี่ห้อ *" error={errors.brand}>
                    <select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className={sc(errors.brand)}>
                      <option value="">-- เลือกยี่ห้อ --</option>
                      {fieldConfig.brands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </FF>
                  <FF label="รุ่น *" error={errors.model}>
                    <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="เช่น CPCD30" className={ic(errors.model)} />
                  </FF>
                  <FF label="ปีที่ผลิต" error="">
                    <input value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} placeholder="เช่น 2023" className={ic("")} />
                  </FF>
                  <FF label="กลุ่มรถ" error="">
                    <select value={form.vehicle_group} onChange={e => setForm({ ...form, vehicle_group: e.target.value })} className={sc("")}>
                      <option value="">-- เลือกกลุ่มรถ --</option>
                      {fieldConfig.vehicleGroups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </FF>
                  <FF label="เลขที่ PI" error="">
                    <input value={form.pi_no} onChange={e => setForm({ ...form, pi_no: e.target.value })} placeholder="เช่น PI-2024-001" className={ic("")} />
                  </FF>
                </div>
              </Section>

              <Section title="สเปครถ">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FF label="พิกัดยก" error="">
                    <input value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="เช่น 3 ตัน" className={ic("")} />
                  </FF>
                  <FF label="ยก (kg) / Capacity" error="">
                    <input value={form.capacity_kg} onChange={e => setForm({ ...form, capacity_kg: e.target.value })} placeholder="เช่น 3000" className={ic("")} />
                  </FF>
                  <FF label="ความสูงยก" error="">
                    <input value={form.height} onChange={e => setForm({ ...form, height: e.target.value })} placeholder="เช่น 3 เมตร / M400" className={ic("")} />
                  </FF>
                  <FF label="เชื้อเพลิง *" error={errors.fuel}>
                    <select value={form.fuel} onChange={e => setForm({ ...form, fuel: e.target.value })} className={sc(errors.fuel)}>
                      <option value="">-- เลือกเชื้อเพลิง --</option>
                      {fieldConfig.fuelTypes.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </FF>
                  <FF label="ประเภทคอนโทรล" error="">
                    <select value={form.control_type} onChange={e => setForm({ ...form, control_type: e.target.value })} className={sc("")}>
                      <option value="">-- เลือกประเภท --</option>
                      {fieldConfig.controlTypes.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FF>
                  <FF label="ความยาวของงาน (Fork Length)" error="">
                    <input value={form.fork_length} onChange={e => setForm({ ...form, fork_length: e.target.value })} placeholder="เช่น 1200 mm" className={ic("")} />
                  </FF>
                </div>
              </Section>

              <Section title="การรับรถและสั่งซื้อ">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FF label="สถานะสั่งซื้อ" error="">
                    <select value={form.po_status} onChange={e => setForm({ ...form, po_status: e.target.value })} className={sc("")}>
                      <option value="">-- เลือกสถานะ --</option>
                      {fieldConfig.poStatuses.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </FF>
                  <FF label="โลเคชั่น" error="">
                    <select value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className={sc("")}>
                      <option value="">-- เลือกโลเคชั่น --</option>
                      {fieldConfig.locations.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </FF>
                  <FF label="วันที่รับรถ" error="">
                    <input type="date" value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })} className={ic("")} />
                  </FF>
                  <FF label="สถานะ Stock" error="">
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={sc("")}>
                      {fieldConfig.stockStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FF>
                </div>
              </Section>

              <Section title="ราคาและการติดตั้ง">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FF label="ราคาทุน (บาท) *" error={errors.cost_price}>
                    <input type="number" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} placeholder="420000" className={ic(errors.cost_price)} />
                  </FF>
                  <FF label="ราคาสต็อก (บาท) *" error={errors.stock_price}>
                    <input type="number" value={form.stock_price} onChange={e => setForm({ ...form, stock_price: e.target.value })} placeholder="520000" className={ic(errors.stock_price)} />
                  </FF>
                  <FF label="วันที่ติดตั้ง" error="">
                    <input type="date" value={form.install_date} onChange={e => setForm({ ...form, install_date: e.target.value })} className={ic("")} />
                  </FF>
                  <FF label="ค่าติดตั้ง (บาท)" error="">
                    <input type="number" value={form.install_cost} onChange={e => setForm({ ...form, install_cost: e.target.value })} placeholder="0" className={ic("")} />
                  </FF>
                  <div className="sm:col-span-2">
                    <FF label="อุปกรณ์ติดตั้งเพิ่ม" error="">
                      <textarea value={form.attachments} onChange={e => setForm({ ...form, attachments: e.target.value })}
                        rows={2} placeholder="เช่น ตะขอ, โคมไฟ, กล้อง..."
                        className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-slate-800 placeholder:text-slate-400 resize-none transition-all" />
                    </FF>
                  </div>
                </div>
              </Section>

              {/* ── Section: ฟิลด์เพิ่มเติม ── */}
              <Section title="ฟิลด์เพิ่มเติม">
                {fieldConfig.customFieldDefs.length === 0 && inlineStep === null && (
                  <p className="text-xs text-slate-400 text-center py-1 mb-2">
                    ยังไม่มีฟิลด์ — กดปุ่ม + เพื่อเพิ่มช่องกรอกที่ต้องการ
                  </p>
                )}

                {/* Existing custom fields */}
                {fieldConfig.customFieldDefs.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    {fieldConfig.customFieldDefs.map(def => (
                      <div key={def.id} className="relative group">
                        <FF label={`${def.name}${def.type === "select" ? " ▼" : ""}`} error="">
                          {def.type === "select" ? (
                            <select
                              value={customValues[def.id] ?? ""}
                              onChange={e => setCustomValues(p => ({ ...p, [def.id]: e.target.value }))}
                              className={sc("")}
                            >
                              <option value="">-- เลือก --</option>
                              {(def.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <input
                              value={customValues[def.id] ?? ""}
                              onChange={e => setCustomValues(p => ({ ...p, [def.id]: e.target.value }))}
                              placeholder={`กรอก${def.name}...`}
                              className={ic("")}
                            />
                          )}
                        </FF>
                        <button type="button" onClick={() => removeCustomFieldDef(def.id)} title="ลบฟิลด์"
                          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-lg transition-all">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Multi-step inline add */}
                {inlineStep === null && (
                  <button type="button" onClick={() => setInlineStep("name")}
                    className="w-full border-2 border-dashed border-violet-200 hover:border-violet-400 bg-violet-50/50 hover:bg-violet-50 text-violet-600 hover:text-violet-700 rounded-xl py-2.5 text-sm font-semibold transition-all flex items-center justify-center gap-1.5">
                    <Plus className="w-4 h-4" />เพิ่มช่องกรอกใหม่
                  </button>
                )}

                {/* Step 1: Name */}
                {inlineStep === "name" && (
                  <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-4 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-violet-700">ขั้นตอน 1 / 2 — ตั้งชื่อช่อง</p>
                    <div className="flex items-center gap-2">
                      <input autoFocus value={inlineName} onChange={e => setInlineName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (inlineName.trim()) setInlineStep("type"); } if (e.key === "Escape") resetInline(); }}
                        placeholder="ชื่อช่อง เช่น เลขที่อยู่รถ, สเปครถ..."
                        className="flex-1 border border-violet-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white text-slate-800 placeholder:text-slate-400"
                      />
                      <button type="button" onClick={() => { if (inlineName.trim()) setInlineStep("type"); }}
                        disabled={!inlineName.trim()}
                        className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                        ต่อไป →
                      </button>
                      <button type="button" onClick={resetInline} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2.5 rounded-xl transition-all">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Type */}
                {inlineStep === "type" && (
                  <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setInlineStep("name")}
                        className="text-violet-500 hover:text-violet-700 hover:bg-violet-100 p-1.5 rounded-lg transition-all">
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <p className="text-xs font-semibold text-violet-700">
                        ขั้นตอน 2 / 2 — &quot;{inlineName}&quot; เป็นช่องแบบไหน?
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button"
                        onClick={() => { setInlineType("text"); commitInlineField(); }}
                        className="flex flex-col items-center gap-2 border-2 border-slate-200 hover:border-emerald-400 bg-white hover:bg-emerald-50 rounded-2xl p-4 transition-all group">
                        <div className="bg-slate-100 group-hover:bg-emerald-100 rounded-xl p-2.5 transition-colors">
                          <Type className="w-5 h-5 text-slate-500 group-hover:text-emerald-600" />
                        </div>
                        <p className="text-sm font-bold text-slate-700 group-hover:text-emerald-700">ช่องพิมพ์</p>
                        <p className="text-xs text-slate-400 text-center leading-relaxed">กรอกข้อความอิสระ</p>
                      </button>
                      <button type="button"
                        onClick={() => { setInlineType("select"); setInlineStep("options"); }}
                        className="flex flex-col items-center gap-2 border-2 border-slate-200 hover:border-violet-400 bg-white hover:bg-violet-50 rounded-2xl p-4 transition-all group">
                        <div className="bg-slate-100 group-hover:bg-violet-100 rounded-xl p-2.5 transition-colors">
                          <ListOrdered className="w-5 h-5 text-slate-500 group-hover:text-violet-600" />
                        </div>
                        <p className="text-sm font-bold text-slate-700 group-hover:text-violet-700">ช่องตัวเลือก</p>
                        <p className="text-xs text-slate-400 text-center leading-relaxed">กดเลือกจากรายการ</p>
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Options (for select type) */}
                {inlineStep === "options" && (
                  <div className="border border-violet-200 bg-violet-50/40 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setInlineStep("type")}
                        className="text-violet-500 hover:text-violet-700 hover:bg-violet-100 p-1.5 rounded-lg transition-all">
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <p className="text-xs font-semibold text-violet-700">
                        เพิ่มตัวเลือกสำหรับ &quot;{inlineName}&quot;
                      </p>
                    </div>

                    {/* Options list */}
                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                      {inlineOptions.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-2">ยังไม่มีตัวเลือก — เพิ่มด้านล่าง</p>
                      )}
                      {inlineOptions.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                          <span className="flex-1 text-sm text-slate-700">{opt}</span>
                          <button type="button" onClick={() => setInlineOptions(p => p.filter((_, j) => j !== i))}
                            className="text-slate-400 hover:text-red-600 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Add option input */}
                    <div className="flex items-center gap-2">
                      <input value={inlineOptInput} onChange={e => setInlineOptInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addInlineOption(); } }}
                        placeholder="พิมพ์ตัวเลือก เช่น HELI ไฟฟ้า สูง 400 ยก 2.5K..."
                        className="flex-1 border border-dashed border-violet-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400 bg-white"
                      />
                      <button type="button" onClick={addInlineOption} disabled={!inlineOptInput.trim()}
                        className="bg-slate-200 hover:bg-slate-300 disabled:opacity-40 text-slate-700 px-3 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" />เพิ่ม
                      </button>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-violet-100">
                      <button type="button" onClick={resetInline}
                        className="flex-1 border border-slate-200 text-slate-600 hover:bg-slate-50 py-2 rounded-xl text-sm font-semibold transition-colors">
                        ยกเลิก
                      </button>
                      <button type="button" onClick={commitInlineField}
                        className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
                        <Check className="w-4 h-4" />
                        บันทึก ({inlineOptions.length} ตัวเลือก)
                      </button>
                    </div>
                  </div>
                )}
              </Section>

              <button type="submit"
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-sm hover:shadow-md flex items-center justify-center gap-2 text-sm">
                <Plus className="w-4 h-4" />เพิ่มเข้าสต็อก
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* ── Inventory List Modal ── */}
      {showList && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowList(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-800">รายการสต็อกทั้งหมด</h3>
                <p className="text-xs text-slate-500 mt-0.5">{forklifts.length} คัน</p>
              </div>
              <button onClick={() => setShowList(false)}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
              {forklifts.map(item => (
                <div key={item.id} className="flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl p-3.5 transition-colors group">
                  <div className="bg-white border border-slate-200 rounded-xl p-2 flex-shrink-0 shadow-sm">
                    <Package className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{item.unit_no} — {item.brand} {item.model}</p>
                    <p className="text-xs text-slate-500">{item.capacity}{item.capacity_kg ? ` / ${item.capacity_kg} kg` : ""} · {item.fuel}{item.location ? ` · ${item.location}` : ""}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                    {item.status}
                  </span>
                  {deleteConfirm === item.id ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => { deleteForklift(item.id); setDeleteConfirm(null); }}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors">ยืนยัน</button>
                      <button onClick={() => setDeleteConfirm(null)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors">ยกเลิก</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Settings Modal (scroll fixed) ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: "90vh" }}>

            {/* Header — fixed */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="bg-violet-100 rounded-xl p-2"><Settings className="w-4 h-4 text-violet-600" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">จัดการตัวเลือกช่องกรอก</h3>
                  <p className="text-xs text-slate-500">แก้ไข เพิ่ม หรือลบตัวเลือกในแต่ละช่อง</p>
                </div>
              </div>
              <button onClick={() => { setShowSettings(false); setEditingField(null); setExpandedCfId(null); }}
                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-scroll flex-1 min-h-0 p-5 flex flex-col gap-4">

              {/* Standard dropdown fields */}
              {(Object.keys(FIELD_LABELS) as DropdownField[]).map(field => (
                <div key={field} className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button onClick={() => setEditingField(editingField === field ? null : field)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                    <span className="font-semibold text-slate-800 text-sm">{FIELD_LABELS[field]}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{fieldConfig[field].length} ตัวเลือก</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${editingField === field ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {editingField === field && (
                    <div className="p-4 flex flex-col gap-2 border-t border-slate-100">
                      {fieldConfig[field].map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          {editingOption?.idx === idx ? (
                            <>
                              <input autoFocus value={editingOption.val}
                                onChange={e => setEditingOption({ idx, val: e.target.value })}
                                onKeyDown={e => { if (e.key === "Enter") saveEditOption(); if (e.key === "Escape") setEditingOption(null); }}
                                className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                              <button onClick={saveEditOption} className="bg-indigo-600 hover:bg-indigo-700 text-white p-1.5 rounded-lg transition-colors"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setEditingOption(null)} className="bg-slate-200 text-slate-700 p-1.5 rounded-lg"><X className="w-4 h-4" /></button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5">{opt}</span>
                              <button onClick={() => setEditingOption({ idx, val: opt })} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteOption(field, idx)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-100">
                        <input value={newOption} onChange={e => setNewOption(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveOption(); } }}
                          placeholder="พิมพ์ตัวเลือกใหม่..."
                          className="flex-1 border border-dashed border-emerald-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-slate-400" />
                        <button onClick={saveOption} disabled={!newOption.trim()}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5" />เพิ่ม
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Custom fields manager */}
              <div className="border border-violet-100 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 bg-violet-50 flex items-center justify-between">
                  <span className="font-semibold text-violet-800 text-sm">ฟิลด์กำหนดเอง (Custom Fields)</span>
                  <span className="text-xs text-violet-500">{fieldConfig.customFieldDefs.length} ฟิลด์</span>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {fieldConfig.customFieldDefs.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">ยังไม่มีฟิลด์กำหนดเอง</p>
                  )}
                  {fieldConfig.customFieldDefs.map(def => (
                    <div key={def.id} className="border border-slate-100 rounded-xl overflow-hidden">
                      {/* Field header */}
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${def.type === "select" ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-600"}`}>
                          {def.type === "select" ? "ตัวเลือก" : "ข้อความ"}
                        </span>
                        {editingCfId === def.id ? (
                          <>
                            <input autoFocus value={editingCfVal} onChange={e => setEditingCfVal(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && editingCfVal.trim()) { renameCustomFieldDef(def.id, editingCfVal); setEditingCfId(null); } if (e.key === "Escape") setEditingCfId(null); }}
                              className="flex-1 border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            <button onClick={() => { if (editingCfVal.trim()) renameCustomFieldDef(def.id, editingCfVal); setEditingCfId(null); }}
                              className="text-white bg-indigo-600 hover:bg-indigo-700 p-1.5 rounded-lg transition-colors"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingCfId(null)} className="text-slate-600 bg-slate-200 p-1.5 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-sm font-semibold text-slate-800">{def.name}</span>
                            <button onClick={() => { setEditingCfId(def.id); setEditingCfVal(def.name); }}
                              className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                            {def.type === "select" && (
                              <button onClick={() => setExpandedCfId(expandedCfId === def.id ? null : def.id)}
                                className="text-slate-400 hover:text-violet-600 hover:bg-violet-50 p-1.5 rounded-lg transition-all">
                                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedCfId === def.id ? "rotate-180" : ""}`} />
                              </button>
                            )}
                            <button onClick={() => removeCustomFieldDef(def.id)}
                              className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>

                      {/* Options editor (select type only) */}
                      {def.type === "select" && expandedCfId === def.id && (
                        <div className="p-3 border-t border-slate-100 flex flex-col gap-2">
                          {(def.options ?? []).length === 0 && <p className="text-xs text-slate-400 text-center py-1">ยังไม่มีตัวเลือก</p>}
                          {(def.options ?? []).map((opt, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              {cfEditingOpt?.idx === idx ? (
                                <>
                                  <input autoFocus value={cfEditingOpt.val} onChange={e => setCfEditingOpt({ idx, val: e.target.value })}
                                    onKeyDown={e => { if (e.key === "Enter" && cfEditingOpt.val.trim()) { editCustomFieldOption(def.id, idx, cfEditingOpt.val); setCfEditingOpt(null); } if (e.key === "Escape") setCfEditingOpt(null); }}
                                    className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                  <button onClick={() => { if (cfEditingOpt.val.trim()) editCustomFieldOption(def.id, idx, cfEditingOpt.val); setCfEditingOpt(null); }}
                                    className="bg-indigo-600 text-white p-1.5 rounded-lg"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setCfEditingOpt(null)} className="bg-slate-200 text-slate-700 p-1.5 rounded-lg"><X className="w-3.5 h-3.5" /></button>
                                </>
                              ) : (
                                <>
                                  <span className="flex-1 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5">{opt}</span>
                                  <button onClick={() => setCfEditingOpt({ idx, val: opt })} className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1.5 rounded-lg transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => removeCustomFieldOption(def.id, idx)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                            <input value={cfNewOption} onChange={e => setCfNewOption(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && cfNewOption.trim()) { addCustomFieldOption(def.id, cfNewOption); setCfNewOption(""); } }}
                              placeholder="พิมพ์ตัวเลือกใหม่..."
                              className="flex-1 border border-dashed border-violet-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400" />
                            <button onClick={() => { if (cfNewOption.trim()) { addCustomFieldOption(def.id, cfNewOption); setCfNewOption(""); } }}
                              disabled={!cfNewOption.trim()}
                              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                              <Plus className="w-3.5 h-3.5" />เพิ่ม
                            </button>
                          </div>
                        </div>
                      )}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-px flex-1 bg-slate-100" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-2">{title}</span>
        <div className="h-px flex-1 bg-slate-100" />
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon, color, bg, iconBg }: {
  label: string; value: number; icon: React.ReactNode; color: string; bg: string; iconBg: string;
}) {
  return (
    <div className={`${bg} border rounded-2xl p-4 flex flex-col gap-2`}>
      <div className={`${iconBg} rounded-lg p-1.5 w-fit`}>{icon}</div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-600 font-medium">{label}</p>
    </div>
  );
}

function FF({ label, error, children }: { label: string; error: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0" />{error}</p>}
    </div>
  );
}

function ic(error?: string) {
  return `w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all ${error ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300 bg-white"}`;
}
function sc(error?: string) {
  return `w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all ${error ? "border-red-300" : "border-slate-200 hover:border-slate-300"}`;
}
