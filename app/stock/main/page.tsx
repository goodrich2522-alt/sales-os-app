"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Plus, LogOut, CheckCircle, AlertCircle, List, X,
  TrendingUp, Boxes, Trash2, Settings, Pencil, Check, ChevronDown,
  Type, ListOrdered, ArrowLeft, Clock, Hash, Camera, ImageOff, Eye,
  Bell, Download, Upload, FileText, ShoppingCart, User
} from "lucide-react";
import { Forklift } from "@/lib/types";
import { useApp, FieldConfig } from "@/lib/AppContext";
import { buildForkliftId, isPendingId } from "@/lib/productId";
import { STATUS_BADGE } from "@/lib/constants";
import { thaiMonthShort } from "@/lib/format";
import { Lightbox } from "@/components/ui/Lightbox";
import { parseForkliftCsv, assignIdsAndStamp, buildCsvTemplate } from "@/lib/forkliftCsv";
import { hasActiveSession, signOutSupabase } from "@/lib/auth";
import { apiEnabled } from "@/lib/api";
import { driveImg } from "@/lib/img";


// ฟิลด์ dropdown ฝั่งสต็อก — ไม่รวมประเภทการขาย/การชำระ (จัดการในหน้าฝ่ายขาย)
type DropdownField = keyof Omit<FieldConfig, "customFieldDefs" | "saleExtraFieldDefs" | "salesFilterRequests" | "saleTypes" | "paymentTypes" | "knownUsers" | "adminEmails">;

// หมายเหตุ: ไม่รวม stockStatuses — สถานะรถถูกล็อกเป็นชุดมาตรฐาน 5 ค่า แก้ไม่ได้
// (รอรับ/พร้อมขาย/จอง/รอผ่านไฟแนนซ์/ปิดการขายแล้ว) ผูกกับปุ่มในการ์ดปิดการขาย
const FIELD_LABELS: Record<Exclude<DropdownField, "stockStatuses">, string> = {
  brands: "ยี่ห้อ",
  vehicleGroups: "กลุ่มรถ",
  fuelTypes: "พลังงาน",
  controlTypes: "ประเภทคอนโทรล",
  poStatuses: "สถานะสั่งซื้อ",
  locations: "โลเคชั่น",
  customerTypes: "ประเภทลูกค้า",
  financeCompanies: "บริษัทไฟแนนซ์",
  capacityOptions: "น้ำหนักยก (กก.)",
  heightOptions: "ยกสูง (เมตร)",
};

// หมวดรถ 3 ไลน์ — สเปกกรอกเหมือนกันทุกไลน์
const VEHICLE_CATS = [
  { key: "Forklift", label: "โฟล์คลิฟท์", icon: "🚜" },
  { key: "Stacker",  label: "สแตกเกอร์",  icon: "📦" },
  { key: "Handlift", label: "แฮนด์ลิฟท์", icon: "🔧" },
] as const;

// แสดงน้ำหนักยก: ≥1000 กก. โชว์เป็นตัน อ่านง่ายกว่า
const fmtCap = (v: string) => {
  const n = Number(v);
  return n >= 1000 ? `${n / 1000} ตัน` : `${v} กก.`;
};

// แปลงเวลาเติม → "10 ก.ค. 69 · 14:30 น." (พ.ศ. + เวลา) · ถ้าเป็นแค่วันที่ (ของเก่า) ไม่โชว์เวลา
function fmtAdded(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const date = `${d.getDate()} ${thaiMonthShort(d.getMonth() + 1)} ${(d.getFullYear() + 543) % 100}`;
  const hasTime = /T\d\d:/.test(iso);
  if (!hasTime) return date;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date} · ${hh}:${mm} น.`;
}

// ช่องกรอกตามไฟล์ Excel STOCK (11 ช่อง) + สเปกรถที่เซลล์ใช้ค้นหา
const emptyForm = {
  sale_contract: "",    // 1 SALE CONTRACT
  model: "",            // 2 MODEL
  mast: "",             // 3 MAST (รหัสเสา — เก็บใน custom_fields)
  valve: "",            // 4 Valve
  SN: "",          // 5 SN
  cost_price: "",       // 6 PRICE(ทุน)
  received_date: "",    // 7 วันรับรถ
  status: "พร้อมขาย",   // 8 สถานะ
  detail_customer: "",  // 9 รายละเอียด (ลูกค้า)
  invoice_no: "",       // 10 เลขที่ใบกำกับภาษี
  detail_note: "",      // 11 รายละเอียด (หมายเหตุ)
  // ── สเปกรถ (เซลล์กรองด้วยค่าพวกนี้) ──
  vehicle_category: "Forklift" as "Forklift" | "Stacker" | "Handlift",
  brand: "HELI",        // ยี่ห้อ
  capacity_kg: "",      // น้ำหนักยก (กก.)
  height_m: "",         // ยกสูง (เมตร)
  fork_length: "",      // ความยาวงา (มม.)
  fuel: "",             // พลังงาน
};

// Inline add step machine
type InlineStep = "name" | "type" | "options" | null;

export default function StockMain() {
  const router = useRouter();
  const {
    forklifts, addForklift, addForkliftsBulk, deleteForklift, inspections, sales,
    exportData, importData,
    fieldConfig, updateFieldOptions,
    addCustomFieldDef, removeCustomFieldDef, renameCustomFieldDef,
    addCustomFieldOption, removeCustomFieldOption, editCustomFieldOption,
  } = useApp();

  const [username, setUsername]     = useState("");
  const [form, setForm]             = useState(emptyForm);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [submitted, setSubmitted]   = useState(false);
  const [lastProductId, setLastProductId] = useState(""); // รหัสสินค้าที่เพิ่งสร้าง — โชว์ในแบนเนอร์สำเร็จ
  // เติมสต็อกเคสพิเศษ: รถล็อตเดียวกันหลายคัน SN ไล่เลขอัตโนมัติ
  const [bulkMode, setBulkMode]     = useState(false);
  const [bulkPrefix, setBulkPrefix] = useState("");   // ส่วนนำหน้า SN (เหมือนกันทุกคัน) เช่น "SDA2016-"
  const [bulkStart, setBulkStart]   = useState("");   // เลขเริ่ม (จำนวนหลักที่พิมพ์ = จำนวนหลักที่เติม 0) เช่น "0001"
  const [bulkCount, setBulkCount]   = useState("");   // จำนวนรถในล็อต
  const [bulkDone, setBulkDone]     = useState(0);     // จำนวนที่เพิ่งเพิ่มแบบล็อต (โชว์ในแบนเนอร์)
  const [showList, setShowList]     = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [listCat, setListCat]       = useState<"all" | "Forklift" | "Stacker" | "Handlift">("all");
  const [listStatus, setListStatus] = useState("all");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showSettings, setShowSettings]   = useState(false);
  const [detailItem, setDetailItem]       = useState<Forklift | null>(null); // รถที่กดดูรายละเอียด
  const [detailLightbox, setDetailLightbox] = useState<{ imgs: string[]; idx: number } | null>(null);

  // ── แจ้งเตือนเด้งเมื่อเซลล์ทำรายการขายใหม่เข้ามา (realtime) ──
  type SaleAlert = { id: string; staff: string; status: string; title: string; sub: string };
  const [saleAlerts, setSaleAlerts] = useState<SaleAlert[]>([]);
  const prevSaleIdsRef = useRef<Set<string>>(new Set());
  const alertReadyRef  = useRef(false);
  const dismissAlert = (id: string) => setSaleAlerts(a => a.filter(x => x.id !== id));

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
    const u = localStorage.getItem("stock_user");
    if (!u) { router.push("/stock/login"); return; }
    setUsername(JSON.parse(u).name);
    // มีข้อมูลค้างแต่ session Supabase หมดอายุ/ไม่มี → บังคับล็อกอินใหม่ (กันเซฟไม่เข้าแบบเงียบๆ)
    (async () => {
      if (apiEnabled && !(await hasActiveSession())) {
        localStorage.removeItem("stock_user");
        router.push("/stock/login");
      }
    })();
  }, [router]);

  // เปิดใช้แจ้งเตือนหลังโหลดข้อมูลชุดแรกเสร็จ (กันเด้งรัวตอนเปิดหน้า)
  useEffect(() => {
    const t = setTimeout(() => { alertReadyRef.current = true; }, 2500);
    return () => clearTimeout(t);
  }, []);

  // ตรวจดีลใหม่จาก sales — id ที่ไม่เคยเห็น = เซลล์เพิ่งทำรายการเข้ามา → เด้งป๊อปอัพ
  useEffect(() => {
    const prev = prevSaleIdsRef.current;
    if (alertReadyRef.current) {
      const fresh = sales.filter(s => !prev.has(s.id));
      if (fresh.length > 0) {
        const toAlert = (s: typeof sales[number]): SaleAlert => ({
          id: s.id,
          staff: s.sales_staff || "เซลล์",
          status: String(s.sale_status ?? "ขายแล้ว"),
          title: `${s.forklift_brand} ${s.forklift_model}`.trim() || s.forklift_unit_no || "รถ",
          sub: `${s.customer_name || "ลูกค้า"} · ฿${Number(s.actual_sale || 0).toLocaleString("th-TH")}`,
        });
        const news = fresh.map(toAlert);
        setSaleAlerts(a => [...news, ...a].slice(0, 5));
        news.forEach(n => setTimeout(() => dismissAlert(n.id), 12000)); // เด้งค้าง 12 วิ
      }
    }
    prevSaleIdsRef.current = new Set(sales.map(s => s.id));
  }, [sales]);

  // สร้างรายการ SN ไล่เลข — จำนวนหลักที่พิมพ์ในเลขเริ่ม = จำนวนหลักที่เติม 0 (0001 → 0001,0002,…)
  const bulkSNs = (): string[] => {
    const startStr = bulkStart.trim();
    const base = Number(startStr);
    const count = Math.floor(Number(bulkCount));
    if (!startStr || !Number.isFinite(base) || !Number.isFinite(count) || count < 1) return [];
    const pad = startStr.length;
    const prefix = bulkPrefix.trim().toUpperCase();
    return Array.from({ length: Math.min(count, 500) }, (_, i) => `${prefix}${String(base + i).padStart(pad, "0")}`);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (bulkMode) {
      if (!bulkStart.trim() || !Number.isFinite(Number(bulkStart))) e.bulk = "กรอกเลขเริ่มต้น SN (เช่น 0001)";
      else if (!bulkCount || Math.floor(Number(bulkCount)) < 1) e.bulk = "กรอกจำนวนรถในล็อต";
    } else if (!form.SN.trim()) e.SN = "กรุณากรอก SN";
    if (!form.model.trim()) e.model = "กรุณากรอกรุ่น";
    // สเปกที่เซลล์ใช้ค้นหา — ถ้าไม่กรอก เซลล์จะหารถคันนี้ไม่เจอ
    if (!form.capacity_kg) e.capacity_kg = "เลือกน้ำหนักยก — เซลล์ใช้ค้นหา";
    if (!form.fuel) e.fuel = "เลือกพลังงาน — เซลล์ใช้ค้นหา";
    if (!form.height_m && form.vehicle_category !== "Handlift") e.height_m = "เลือกยกสูง — เซลล์ใช้ค้นหา";
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const cf: Record<string, string> = { ...customValues };
    if (form.mast.trim())            cf["MAST"] = form.mast.trim(); // รหัสเสา — เก็บอ้างอิง
    if (form.detail_customer.trim()) cf["รายละเอียด (ลูกค้า)"] = form.detail_customer.trim();
    if (form.invoice_no.trim())      cf["เลขที่ใบกำกับภาษี"] = form.invoice_no.trim();
    if (form.detail_note.trim())     cf["รายละเอียด (หมายเหตุ)"] = form.detail_note.trim();
    // ฟิลด์ที่ใช้ร่วมทุกคัน (ยกเว้น id/SN/created_at ที่ต่างกันรายคัน)
    const shared: Omit<Forklift, "id" | "SN" | "created_at"> = {
      brand: form.brand, model: form.model, capacity: "",
      capacity_kg: form.capacity_kg, height: form.height_m,
      fork_length: form.fork_length || undefined, fuel: form.fuel,
      vehicle_category: form.vehicle_category, control_type: form.valve || undefined,
      pi_no: form.sale_contract || undefined, received_date: form.received_date || undefined,
      cost_price: form.cost_price ? Number(form.cost_price) : 0, stock_price: 0,
      status: form.status,
      custom_fields: Object.keys(cf).length > 0 ? cf : undefined,
    };

    if (bulkMode) {
      // เติมล็อต — SN ไล่เลข + รหัสสินค้าไล่ต่อกันไม่ชน
      const rows = bulkSNs().map(sn => ({ ...shared, SN: sn })) as Omit<Forklift, "id">[];
      const withIds = assignIdsAndStamp(rows, forklifts);
      addForkliftsBulk(withIds);
      setBulkDone(withIds.length);
      setLastProductId(`${withIds[0]?.id} – ${withIds[withIds.length - 1]?.id}`);
      setBulkStart(""); setBulkCount(""); setBulkPrefix("");
    } else {
      const sn = form.SN.toUpperCase();
      const productId = buildForkliftId(sn, form.sale_contract, forklifts);
      addForklift({ id: productId, SN: sn, created_at: new Date().toISOString(), ...shared });
      setLastProductId(productId);
      setBulkDone(0);
    }
    setForm(emptyForm); setCustomValues({}); setErrors({});
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 6000);
  };

  const handleLogout = () => { void signOutSupabase(); localStorage.removeItem("stock_user"); router.push("/stock/login"); };

  // ── เครื่องมือข้อมูล: สำรอง (export) / นำเข้า (import) / อัปโหลด CSV ──
  const [dataBusy, setDataBusy]   = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [csvMsg, setCsvMsg]       = useState<{ ok: boolean; text: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef     = useRef<HTMLInputElement>(null);

  const downloadFile = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // เซฟข้อมูลปัจจุบันทั้งหมดเป็นไฟล์ (รถ + ดีลขาย + ตรวจรับ + การตั้งค่า)
  const handleExport = () => {
    const data = exportData();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`salesos-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
  };

  // นำเข้าไฟล์สำรองที่เคยเซฟไว้ (กู้คืนข้อมูล)
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setDataBusy(true); setImportMsg(null);
    try {
      const data = JSON.parse(await file.text());
      const res = await importData(data);
      setImportMsg({ ok: true, text: `นำเข้าสำเร็จ — รถ ${res.forklifts} · ดีลขาย ${res.sales} · ตรวจรับ ${res.inspections}` });
    } catch (err) {
      setImportMsg({ ok: false, text: err instanceof Error ? err.message : "ไฟล์เสียหรือรูปแบบไม่ถูกต้อง" });
    }
    setDataBusy(false);
  };

  // อัปโหลดรถหลายคันจากไฟล์ CSV
  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setDataBusy(true); setCsvMsg(null);
    try {
      const parsed = parseForkliftCsv(await file.text());
      if (parsed.rowCount === 0) {
        setCsvMsg({ ok: false, text: parsed.errors[0] || "ไม่พบข้อมูลรถในไฟล์" });
      } else {
        const rows = assignIdsAndStamp(parsed.forklifts, forklifts);
        addForkliftsBulk(rows);
        const warn = parsed.errors.length ? ` (ข้าม ${parsed.errors.length} แถวที่ไม่สมบูรณ์)` : "";
        setCsvMsg({ ok: true, text: `เพิ่มรถ ${rows.length} คันเข้าสต็อกแล้ว${warn}` });
      }
    } catch {
      setCsvMsg({ ok: false, text: "อ่านไฟล์ไม่สำเร็จ — ต้องเป็นไฟล์ .csv" });
    }
    setDataBusy(false);
  };

  // เซลล์เจ้าของงานของรถแต่ละคัน (ดีลล่าสุด) — ฝ่ายสต็อกดูได้ว่าเป็นออเดอร์ใคร
  const saleOwnerByFk = useMemo(() => {
    const m = new Map<string, string>();
    [...sales]
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .forEach(s => { if (s.sales_staff) m.set(s.forklift_id, s.sales_staff); });
    return m;
  }, [sales]);

  // นับแยกตามสถานะมาตรฐาน 5 ค่า — ฝ่ายสต็อกเห็นชัดว่าเหลือ/ขาย/ไฟแนนซ์/จอง กี่คัน
  const countStatus = (s: string) => forklifts.filter(f => String(f.status) === s).length;
  const available  = countStatus("พร้อมขาย");                                        // เหลือ (พร้อมขาย)
  const reserved   = countStatus("จอง");                                             // จอง
  const financing  = countStatus("รอผ่านไฟแนนซ์");                                    // ติดไฟแนนซ์
  const sold       = countStatus("ปิดการขายแล้ว");                                    // ขายไปแล้ว
  const waiting    = countStatus("รอรับ");                                            // รอรับเข้าคลัง

  // รายการสต็อกที่กรองแล้ว (สำหรับ modal) — ค้นหา + หมวด + สถานะ
  const hs = (v: unknown) => (v == null ? "" : String(v)).toLowerCase();
  const listFiltered = forklifts.filter(f => {
    const q = listSearch.trim().toLowerCase();
    const okQ = !q || hs(f.id).includes(q) || hs(f.SN).includes(q) || hs(f.brand).includes(q) || hs(f.model).includes(q) || hs(f.pi_no).includes(q);
    const okCat = listCat === "all" || (f.vehicle_category ?? "Forklift") === listCat;
    const okStatus = listStatus === "all" || f.status === listStatus;
    return okQ && okCat && okStatus;
  }).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))); // เติมล่าสุดอยู่บนสุด
  const catCount = (c: string) => c === "all" ? forklifts.length : forklifts.filter(f => (f.vehicle_category ?? "Forklift") === c).length;

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
        {/* Stats — แยกตามสถานะให้ฝ่ายสต็อกเห็นชัดทุกกอง */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="เหลือ (พร้อมขาย)" value={available} icon={<TrendingUp className="w-4 h-4" />} color="text-emerald-700" bg="bg-emerald-50 border-emerald-100" iconBg="bg-emerald-100 text-emerald-600" />
          <StatCard label="จอง"              value={reserved}  icon={<Boxes className="w-4 h-4" />}       color="text-amber-700"   bg="bg-amber-50 border-amber-100"   iconBg="bg-amber-100 text-amber-600" />
          <StatCard label="ติดไฟแนนซ์"       value={financing} icon={<Clock className="w-4 h-4" />}       color="text-rose-700"    bg="bg-rose-50 border-rose-100"     iconBg="bg-rose-100 text-rose-600" />
          <StatCard label="ขายไปแล้ว"        value={sold}      icon={<CheckCircle className="w-4 h-4" />} color="text-indigo-700"  bg="bg-indigo-50 border-indigo-100" iconBg="bg-indigo-100 text-indigo-600" />
        </div>
        {waiting > 0 && (
          <div className="-mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" />มีรถรอรับเข้าคลังอีก <b className="text-blue-700">{waiting}</b> คัน (ยังไม่ขึ้นหน้าขาย)
          </div>
        )}

        {/* ── เครื่องมือข้อมูล: อัปโหลดหลายคัน / สำรอง / นำเข้า ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-700">เครื่องมือข้อมูล</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* อัปโหลดหลายคันจาก CSV */}
            <button onClick={() => csvInputRef.current?.click()} disabled={dataBusy}
              className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-3 text-left transition-colors disabled:opacity-50">
              <Upload className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div className="min-w-0"><p className="text-sm font-bold text-emerald-800">อัปโหลดหลายคัน</p><p className="text-[11px] text-emerald-600">จากไฟล์ Excel/CSV</p></div>
            </button>
            {/* สำรองข้อมูล */}
            <button onClick={handleExport} disabled={dataBusy}
              className="flex items-center gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3.5 py-3 text-left transition-colors disabled:opacity-50">
              <Download className="w-5 h-5 text-indigo-600 flex-shrink-0" />
              <div className="min-w-0"><p className="text-sm font-bold text-indigo-800">สำรองข้อมูล</p><p className="text-[11px] text-indigo-600">เซฟทั้งหมดเป็นไฟล์</p></div>
            </button>
            {/* นำเข้าไฟล์สำรอง */}
            <button onClick={() => importInputRef.current?.click()} disabled={dataBusy}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-3.5 py-3 text-left transition-colors disabled:opacity-50">
              <FileText className="w-5 h-5 text-slate-600 flex-shrink-0" />
              <div className="min-w-0"><p className="text-sm font-bold text-slate-700">นำเข้าข้อมูล</p><p className="text-[11px] text-slate-500">กู้จากไฟล์สำรอง</p></div>
            </button>
          </div>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />
          <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />
          <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
            <button onClick={() => downloadFile("แม่แบบอัปโหลดรถ.csv", buildCsvTemplate(), "text/csv")}
              className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1">
              <Download className="w-3.5 h-3.5" />ดาวน์โหลดแม่แบบ CSV (กรอกใน Excel แล้ว Save As CSV)
            </button>
            {dataBusy && <span className="text-xs text-slate-400">กำลังทำงาน…</span>}
          </div>
          {csvMsg && (
            <p className={`mt-2 text-xs rounded-lg px-3 py-2 flex items-center gap-1.5 ${csvMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {csvMsg.ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}{csvMsg.text}
            </p>
          )}
          {importMsg && (
            <p className={`mt-2 text-xs rounded-lg px-3 py-2 flex items-center gap-1.5 ${importMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {importMsg.ok ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}{importMsg.text}
            </p>
          )}
        </div>

        {/* Add Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <div className="bg-emerald-100 rounded-lg p-1.5"><Plus className="w-4 h-4 text-emerald-600" /></div>
            <h2 className="text-base font-bold text-slate-800">เพิ่มรถใหม่เข้าสต็อก</h2>
            {/* รหัสรถ = SN ที่กรอก (ดู SN-RULES.md) — โชว์ให้เห็นก่อนบันทึกว่าจะได้รหัสอะไร */}
            <span className="ml-auto text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              รหัสรถ: {form.SN.trim() ? buildForkliftId(form.SN.toUpperCase(), form.sale_contract, forklifts) : "— กรอก SN ก่อน"}
            </span>
          </div>
          <div className="p-6">
            {submitted && (
              <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-emerald-800 text-sm font-semibold">{bulkDone > 0 ? `เพิ่มรถเข้าสต็อก ${bulkDone} คันเรียบร้อยแล้ว!` : "เพิ่มรถเข้าสต็อกเรียบร้อยแล้ว!"}</p>
                  {lastProductId && (
                    <p className="text-emerald-700 text-xs mt-0.5">
                      รหัสสินค้า: <span className="font-bold bg-white border border-emerald-200 px-2 py-0.5 rounded-md">{lastProductId}</span> — ใช้รหัสนี้อ้างอิงรถได้ทุกจุดในระบบ
                    </p>
                  )}
                </div>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">

              {/* ── สเปกรถ — เซลล์กรองหารถด้วยค่าพวกนี้ กรอกให้ครบ ── */}
              <Section title="สเปกรถ (เซลล์ใช้ค้นหา)">
                <div className="flex flex-col gap-4">
                  {/* หมวดรถ */}
                  <FF label="ไลน์สินค้า *" error="">
                    <div className="flex items-center gap-2 flex-wrap">
                      {VEHICLE_CATS.map(({ key, label, icon }) => (
                        <button key={key} type="button"
                          onClick={() => setForm({ ...form, vehicle_category: key })}
                          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${form.vehicle_category === key ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                          <span>{icon}</span>{label}
                        </button>
                      ))}
                    </div>
                  </FF>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FF label="ยี่ห้อ *" error="">
                      <select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} className={sc("")}>
                        {fieldConfig.brands.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </FF>
                    <FF label="ความยาวงา (มม.)" error="">
                      <input type="number" value={form.fork_length} onChange={e => setForm({ ...form, fork_length: e.target.value })}
                        placeholder="เช่น 1070 / 1220" className={ic("")} />
                    </FF>
                  </div>

                  {/* พลังงาน — ปุ่มเลือก */}
                  <FF label="พลังงาน *" error={errors.fuel}>
                    <ChipGroup options={fieldConfig.fuelTypes} value={form.fuel}
                      onChange={v => setForm({ ...form, fuel: v })} error={errors.fuel} />
                  </FF>

                  {/* น้ำหนักยก — ปุ่มเลือก */}
                  <FF label="ยกน้ำหนักได้ *" error={errors.capacity_kg}>
                    <ChipGroup options={fieldConfig.capacityOptions} value={form.capacity_kg}
                      onChange={v => setForm({ ...form, capacity_kg: v })} fmt={fmtCap} error={errors.capacity_kg} />
                  </FF>

                  {/* ยกสูง — ปุ่มเลือก (แฮนด์ลิฟท์ไม่บังคับ) */}
                  <FF label={`ยกสูง${form.vehicle_category === "Handlift" ? " (แฮนด์ลิฟท์ไม่ต้องเลือกก็ได้)" : " *"}`} error={errors.height_m}>
                    <ChipGroup options={fieldConfig.heightOptions} value={form.height_m}
                      onChange={v => setForm({ ...form, height_m: v })} fmt={v => `${v} ม.`} error={errors.height_m} />
                  </FF>
                </div>
              </Section>

              <Section title="ข้อมูลรถ (ตามไฟล์ STOCK)">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* เติมสต็อกเคสพิเศษ — รถล็อตเดียวกันหลายคัน SN ไล่เลข */}
                  <div className="sm:col-span-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3.5">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={bulkMode} onChange={e => { setBulkMode(e.target.checked); setErrors({}); }}
                        className="w-4 h-4 accent-violet-600" />
                      <span className="text-sm font-bold text-violet-800 flex items-center gap-1.5"><Boxes className="w-4 h-4" />เติมทีละหลายคัน (รถล็อตเดียวกัน SN ไล่เลข)</span>
                    </label>
                    {bulkMode && (
                      <>
                        <p className="text-xs text-violet-600 mt-2 mb-3">กรอกข้อมูลรถ 1 ครั้ง (PI/รุ่น/สเปกใช้ร่วมกันทั้งล็อต) แล้วตั้งเลข SN — ระบบจะสร้างให้ครบทุกคันเอง</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-600 block mb-1">SN นำหน้า (ถ้ามี)</label>
                            <input value={bulkPrefix} onChange={e => setBulkPrefix(e.target.value)} placeholder="เช่น SDA2016-" className={ic("")} />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-600 block mb-1">เลขเริ่มต้น *</label>
                            <input value={bulkStart} onChange={e => setBulkStart(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="เช่น 0001" className={ic(errors.bulk)} />
                          </div>
                          <div>
                            <label className="text-[11px] font-semibold text-slate-600 block mb-1">จำนวนรถ *</label>
                            <input value={bulkCount} onChange={e => setBulkCount(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="เช่น 60" className={ic(errors.bulk)} />
                          </div>
                        </div>
                        {errors.bulk && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.bulk}</p>}
                        {(() => {
                          const sns = bulkSNs();
                          if (sns.length === 0) return null;
                          return (
                            <p className="text-xs text-violet-700 mt-2 bg-white border border-violet-200 rounded-lg px-3 py-2">
                              จะสร้าง <b>{sns.length}</b> คัน · SN: <b>{sns[0]}</b> ถึง <b>{sns[sns.length - 1]}</b>
                            </p>
                          );
                        })()}
                      </>
                    )}
                  </div>
                  <FF label="SALE CONTRACT" error="">
                    <input value={form.sale_contract} onChange={e => setForm({ ...form, sale_contract: e.target.value })} placeholder="เช่น PI001 / HCTH-BE..." className={ic("")} />
                  </FF>
                  <FF label="MODEL (รุ่น) *" error={errors.model}>
                    <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="เช่น CPCD30-Q22K2" className={ic(errors.model)} />
                  </FF>
                  <FF label="MAST (รหัสเสา — ถ้ามี)" error="">
                    <input value={form.mast} onChange={e => setForm({ ...form, mast: e.target.value })} placeholder="เช่น M400 / ZSM600" className={ic("")} />
                  </FF>
                  <FF label="Valve (คอนโทรล)" error="">
                    <input value={form.valve} onChange={e => setForm({ ...form, valve: e.target.value })} placeholder="เช่น 2 / 3" className={ic("")} />
                  </FF>
                  {!bulkMode && (
                    <FF label="SN (หมายเลขรถ) *" error={errors.SN}>
                      <input value={form.SN} onChange={e => setForm({ ...form, SN: e.target.value })} placeholder="เช่น 010253N9305" className={ic(errors.SN)} />
                    </FF>
                  )}
                  <FF label="PRICE ทุน (บาท)" error="">
                    <input type="number" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} placeholder="เช่น 220000" className={ic("")} />
                  </FF>
                  <FF label="วันรับรถ" error="">
                    <input type="date" value={form.received_date} onChange={e => setForm({ ...form, received_date: e.target.value })} className={ic("")} />
                  </FF>
                  <FF label="สถานะ" error="">
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={sc("")}>
                      {fieldConfig.stockStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FF>
                  <div className="sm:col-span-2">
                    <FF label="รายละเอียด (ลูกค้า)" error="">
                      <input value={form.detail_customer} onChange={e => setForm({ ...form, detail_customer: e.target.value })} placeholder="เช่น บ.ABC จำกัด (ชื่อเซลล์)" className={ic("")} />
                    </FF>
                  </div>
                  <FF label="เลขที่ใบกำกับภาษี" error="">
                    <input value={form.invoice_no} onChange={e => setForm({ ...form, invoice_no: e.target.value })} placeholder="เช่น Q-68121023" className={ic("")} />
                  </FF>
                  <div className="sm:col-span-2">
                    <FF label="รายละเอียด (หมายเหตุ)" error="">
                      <textarea value={form.detail_note} onChange={e => setForm({ ...form, detail_note: e.target.value })}
                        rows={2} placeholder="หมายเหตุเพิ่มเติม เช่น เทิร์นรถ, มี SIM CARD..."
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
            <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-800">รายการสต็อก</h3>
                  <p className="text-xs text-slate-500 mt-0.5">แสดง {listFiltered.length} จาก {forklifts.length} คัน</p>
                </div>
                <button onClick={() => setShowList(false)}
                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* ค้นหา */}
              <input value={listSearch} onChange={e => setListSearch(e.target.value)}
                placeholder="ค้นหา รหัสสินค้า / SN / ยี่ห้อ / รุ่น / PI..."
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800 placeholder:text-slate-400" />
              {/* แท็บหมวด + กรองสถานะ */}
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { key: "all", label: "ทั้งหมด", icon: "📋" },
                  { key: "Forklift", label: "Forklift", icon: "🚜" },
                  { key: "Stacker", label: "Stacker", icon: "📦" },
                  { key: "Handlift", label: "Handlift", icon: "🔧" },
                ] as { key: "all" | "Forklift" | "Stacker" | "Handlift"; label: string; icon: string }[]).map(({ key, label, icon }) => (
                  <button key={key} onClick={() => setListCat(key)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${listCat === key ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"}`}>
                    <span>{icon}</span><span>{label}</span>
                    <span className={`px-1.5 rounded-full ${listCat === key ? "bg-white/30" : "bg-slate-100 text-slate-500"}`}>{catCount(key)}</span>
                  </button>
                ))}
                <select value={listStatus} onChange={e => setListStatus(e.target.value)}
                  className="ml-auto border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="all">ทุกสถานะ</option>
                  {fieldConfig.stockStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
              {listFiltered.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">ไม่พบรถตามเงื่อนไข</div>
              )}
              {listFiltered.map((item, idx) => (
                <div key={item.id} onClick={() => setDetailItem(item)}
                  className={`flex items-center gap-3 border rounded-xl p-3.5 transition-colors group cursor-pointer ${idx === 0 ? "bg-emerald-50/70 border-emerald-200 hover:bg-emerald-50" : "bg-slate-50 hover:bg-slate-100 border-slate-100"}`}>
                  <div className="bg-white border border-slate-200 rounded-xl p-2 flex-shrink-0 shadow-sm">
                    <Package className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* รหัสสินค้า (ID) — โชว์ทุกคันเพื่อแยกรถถูกตัว */}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${isPendingId(item.id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-600 bg-slate-100 border border-slate-200"}`}>#{item.id}</span>
                      <p className="font-semibold text-slate-800 text-sm">{item.SN ? `${item.SN} — ` : ""}{item.brand} {item.model}</p>
                      {idx === 0 && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full flex-shrink-0">ล่าสุด</span>}
                    </div>
                    <p className="text-xs text-slate-500">{item.capacity}{item.capacity_kg ? ` / ${item.capacity_kg} kg` : ""} · {item.fuel}{item.location ? ` · ${item.location}` : ""}</p>
                    {saleOwnerByFk.get(item.id) && item.status !== "พร้อมขาย" && (
                      <p className="text-[11px] text-violet-700 mt-0.5 flex items-center gap-1 font-semibold"><User className="w-3 h-3 flex-shrink-0" />เซลล์: {saleOwnerByFk.get(item.id)}</p>
                    )}
                    {fmtAdded(item.created_at) && (
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3 flex-shrink-0" />เติมเมื่อ {fmtAdded(item.created_at)}</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>
                    {item.status}
                  </span>
                  {deleteConfirm === item.id ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { deleteForklift(item.id); setDeleteConfirm(null); }}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors">ยืนยัน</button>
                      <button onClick={() => setDeleteConfirm(null)}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors">ยกเลิก</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <span className="opacity-0 group-hover:opacity-100 text-indigo-500 flex items-center gap-1 text-xs font-semibold transition-all pr-1"><Eye className="w-4 h-4" />ดู</span>
                      <button onClick={e => { e.stopPropagation(); setDeleteConfirm(item.id); }}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ป๊อปอัพแจ้งเตือน: เซลล์ทำรายการขายเข้ามา ── */}
      {saleAlerts.length > 0 && (
        <div className="fixed z-[70] bottom-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2.5 pointer-events-none">
          <style>{`@keyframes salepop{0%{opacity:0;transform:translateY(16px) scale(.96)}100%{opacity:1;transform:none}}`}</style>
          {saleAlerts.map(al => {
            const green = al.status.includes("ขาย");
            const amber = al.status.includes("จอง");
            const c = green ? { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700", ic: "text-emerald-600" }
                    : amber ? { bar: "bg-amber-500",   chip: "bg-amber-100 text-amber-700",     ic: "text-amber-600" }
                    :         { bar: "bg-rose-500",    chip: "bg-rose-100 text-rose-700",       ic: "text-rose-600" };
            return (
              <div key={al.id} style={{ animation: "salepop .35s ease-out" }}
                className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex">
                <div className={`w-1.5 flex-shrink-0 ${c.bar}`} />
                <div className="flex-1 min-w-0 p-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><ShoppingCart className={`w-4 h-4 ${c.ic}`} />เซลล์ทำรายการใหม่</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.chip}`}>{al.status}</span>
                      <button onClick={() => dismissAlert(al.id)} className="text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <p className="font-bold text-slate-800 text-sm truncate">{al.title}</p>
                  <p className="text-xs text-slate-500 truncate">{al.sub}</p>
                  <p className="text-[11px] text-slate-400 mt-1">โดย {al.staff}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Detail Modal — กดดูรายละเอียดรถทีละคัน ── */}
      {detailItem && (() => {
        const it = detailItem;
        const recs = inspections.filter(r => r.unit_no && it.SN && String(r.unit_no).toUpperCase() === String(it.SN).toUpperCase());
        const photos = recs.flatMap(r => r.images || []);
        const spec: [string, string][] = [
          ["หมวดรถ", it.vehicle_category ?? "Forklift"],
          ["ยี่ห้อ", it.brand],
          ["รุ่น", it.model],
          ["น้ำหนักยก", it.capacity_kg ? fmtCap(it.capacity_kg) : ""],
          ["ยกสูง", it.height ? `${it.height} เมตร` : ""],
          ["ความยาวงา", it.fork_length ? `${it.fork_length} มม.` : ""],
          ["Valve / คอนโทรล", it.control_type ?? ""],
          ["พลังงาน", it.fuel],
        ];
        const info: [string, string][] = [
          ["เซลล์เจ้าของงาน", it.status !== "พร้อมขาย" ? (saleOwnerByFk.get(it.id) ?? "") : ""],
          ["SALE CONTRACT / PI", it.pi_no ?? ""],
          ["วันรับรถ", it.received_date ?? ""],
          ["ราคาทุน", it.cost_price ? `฿${it.cost_price.toLocaleString()}` : ""],
          ["โลเคชั่น", it.location ?? ""],
          ["เติมเข้าสต็อกเมื่อ", fmtAdded(it.created_at)],
        ];
        const customs = Object.entries(it.custom_fields ?? {}).filter(([, v]) => String(v ?? "").trim());
        const Section = ({ title, rows }: { title: string; rows: [string, string][] }) => {
          const shown = rows.filter(([, v]) => String(v ?? "").trim());
          if (shown.length === 0) return null;
          return (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">{title}</p>
              <div className="grid grid-cols-2 gap-2">
                {shown.map(([k, v]) => (
                  <div key={k} className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                    <p className="text-[11px] text-slate-400">{k}</p>
                    <p className="text-sm font-semibold text-slate-700 break-words">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        };
        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && setDetailItem(null)}>
            <div className="bg-white rounded-3xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl">
              {/* header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${isPendingId(it.id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-600 bg-slate-100 border border-slate-200"}`}>#{it.id}</span>
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${STATUS_BADGE[it.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{it.status}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 truncate">{it.brand} {it.model}</h3>
                  {it.SN && <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Hash className="w-3 h-3" />SN {it.SN}</p>}
                </div>
                <button onClick={() => setDetailItem(null)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all flex-shrink-0"><X className="w-5 h-5" /></button>
              </div>
              {/* body */}
              <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-5">
                <Section title="สเปกรถ" rows={spec} />
                <Section title="ข้อมูลสต็อก / จัดซื้อ" rows={info} />
                {customs.length > 0 && <Section title="ข้อมูลเพิ่มเติม" rows={customs as [string, string][]} />}
                {/* รูปตรวจรับ-ส่งรถ */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" />รูปรถ ({photos.length})</p>
                  {photos.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((img, i) => (
                        <button key={i} onClick={() => setDetailLightbox({ imgs: photos, idx: i })}
                          className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 hover:ring-2 hover:ring-emerald-400 transition-all">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={driveImg(img)} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-300 bg-slate-50 rounded-xl border border-slate-100">
                      <ImageOff className="w-7 h-7 mb-1" /><span className="text-xs text-slate-400">ยังไม่มีรูป (ถ่ายตอนรับ/ส่งรถ)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Lightbox รูปในหน้ารายละเอียด (ใช้ component กลาง) */}
      {detailLightbox && (
        <Lightbox
          imgs={detailLightbox.imgs}
          idx={detailLightbox.idx}
          onClose={() => setDetailLightbox(null)}
          onIdx={next => setDetailLightbox(l => l ? { ...l, idx: next } : l)}
        />
      )}

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowSettings(false)}>

          {/* Modal: whole box scrolls — most reliable pattern */}
          <div className="w-full max-w-2xl shadow-2xl"
            style={{ height: "88vh", overflowY: "scroll", borderRadius: "24px", backgroundColor: "white" }}>

            {/* Sticky header — stays at top while content scrolls */}
            <div style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "white", borderBottom: "1px solid #f1f5f9" }}
              className="flex items-center justify-between px-6 py-4">
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

            {/* Content — no overflow needed, parent scrolls */}
            <div className="p-5 flex flex-col gap-4">

              {/* Standard dropdown fields */}
              {(Object.keys(FIELD_LABELS) as Exclude<DropdownField, "stockStatuses">[]).map(field => (
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

// ปุ่มเลือกค่าสเปก — กดเลือก / กดซ้ำเพื่อยกเลิก
function ChipGroup({ options, value, onChange, fmt, error }: {
  options: string[]; value: string; onChange: (v: string) => void;
  fmt?: (v: string) => string; error?: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map(opt => (
        <button key={opt} type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={`px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${value === opt
            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
            : `bg-white text-slate-600 hover:border-emerald-300 ${error ? "border-red-200" : "border-slate-200"}`}`}>
          {fmt ? fmt(opt) : opt}
        </button>
      ))}
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
