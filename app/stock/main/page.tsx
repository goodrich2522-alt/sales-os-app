"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Plus, LogOut, CheckCircle, AlertCircle, List, X,
  TrendingUp, Boxes, Trash2, Settings, Pencil, Check, ChevronDown,
  Clock, Hash, Camera, ImageOff, Eye,
  Download, Upload, FileText, ShoppingCart, User
} from "lucide-react";
import { Forklift } from "@/lib/types";
import { useApp, FieldConfig } from "@/lib/AppContext";
import { isPendingId } from "@/lib/productId";
import { thaiMonthShort } from "@/lib/format";
import { Lightbox } from "@/components/ui/Lightbox";
import { Chip } from "@/components/ui/Chip";
import { StatusBadge } from "@/components/ui/Badge";
import { VEHICLE_CATS, CatFilter } from "@/lib/constants";
import { QuoteImport } from "@/components/QuoteImport";
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

export default function StockMain() {
  const router = useRouter();
  const {
    forklifts, addForkliftsBulk, deleteForklift, inspections, sales,
    exportData, importData,
    fieldConfig, updateFieldOptions,
    removeCustomFieldDef, renameCustomFieldDef,
    addCustomFieldOption, removeCustomFieldOption, editCustomFieldOption,
  } = useApp();

  const [username, setUsername]     = useState("");
  const [showImport, setShowImport] = useState(false);   // นำเข้าจากใบเสนอราคา (เฟส 4)
  const [listSearch, setListSearch] = useState("");
  const [listCat, setListCat]       = useState<CatFilter>("all");
  const [listStatus, setListStatus] = useState("all");
  const [listBrand, setListBrand]   = useState("all");                                       // กรองยี่ห้อ
  const [listModel, setListModel]   = useState("all");                                       // กรองรุ่น
  const [listMast, setListMast]     = useState("all");                                       // กรองเสา (MAST)
  const [listFuel, setListFuel]     = useState("all");                                       // กรองพลังงาน
  const [listSort, setListSort]     = useState<"recent" | "model" | "remain" | "sn">("recent"); // การเรียง
  const [listView, setListView]     = useState<"list" | "table" | "byModel">("list");           // มุมมอง: รายคัน / ตาราง / รวมตามรุ่น
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
  // คลิก StatCard → กรองรายการตามสถานะ + เลื่อนไปที่รายการสต็อก
  const showStatus = (status: string) => {
    setListStatus(status); setListView("list");
    setTimeout(() => document.getElementById("stock-list")?.scrollIntoView({ behavior: "smooth" }), 60);
  };

  // รายการสต็อกที่กรองแล้ว (สำหรับ modal) — ค้นหา + หมวด + ยี่ห้อ + สถานะ + เรียงลำดับ
  const hs = (v: unknown) => (v == null ? "" : String(v)).toLowerCase();
  const isAvailable = (s: unknown) => String(s ?? "") === "พร้อมขาย"; // "ยังเหลือในสต็อก"
  const mastOf = (f: Forklift) => String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim();
  const listFiltered = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    const rows = forklifts.filter(f => {
      const okQ = !q || hs(f.id).includes(q) || hs(f.SN).includes(q) || hs(f.brand).includes(q) || hs(f.model).includes(q) || hs(f.pi_no).includes(q);
      const okCat = listCat === "all" || (f.vehicle_category ?? "Forklift") === listCat;
      const okBrand = listBrand === "all" || (f.brand || "(ไม่ระบุ)") === listBrand;
      const okModel = listModel === "all" || f.model === listModel;
      const okMast = listMast === "all" || String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim() === listMast;
      const okFuel = listFuel === "all" || f.fuel === listFuel;
      const okStatus = listStatus === "all" || f.status === listStatus;
      return okQ && okCat && okBrand && okModel && okMast && okFuel && okStatus;
    });
    const recent = (a: Forklift, b: Forklift) => String(b.created_at || "").localeCompare(String(a.created_at || ""));
    if (listSort === "model") rows.sort((a, b) => String(a.model || "").localeCompare(String(b.model || "")) || recent(a, b));
    else if (listSort === "sn") rows.sort((a, b) => String(a.SN || "").localeCompare(String(b.SN || "")) || recent(a, b));
    else rows.sort(recent); // recent / remain (remain ใช้ในมุมมอง byModel)
    return rows;
  }, [forklifts, listSearch, listCat, listBrand, listModel, listMast, listFuel, listStatus, listSort]);

  // ตัวเลือก dropdown — ไล่ระดับ ยี่ห้อ→รุ่น→เสา (นับเฉพาะที่มีจริงในสต็อก)
  const modelOpts = [...new Set(forklifts.filter(f => listBrand === "all" || (f.brand || "(ไม่ระบุ)") === listBrand).map(f => f.model).filter(Boolean))].sort();
  const mastOpts  = [...new Set(forklifts.filter(f => (listBrand === "all" || (f.brand || "(ไม่ระบุ)") === listBrand) && (listModel === "all" || f.model === listModel)).map(mastOf).filter(Boolean))].sort();
  const fuelOpts  = [...new Set(forklifts.map(f => f.fuel).filter(Boolean))].sort();

  const catCount = (c: string) => c === "all" ? forklifts.length : forklifts.filter(f => (f.vehicle_category ?? "Forklift") === c).length;
  // ยี่ห้อที่มีจริงในสต็อก (เรียงตามจำนวนมาก→น้อย) — ทำเป็นแท็กกรอง
  const brandList = useMemo(() => {
    const m = new Map<string, number>();
    forklifts.forEach(f => { const b = f.brand || "(ไม่ระบุ)"; m.set(b, (m.get(b) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [forklifts]);
  const brandCount = (b: string) => b === "all" ? forklifts.length : (brandList.find(([n]) => n === b)?.[1] ?? 0);

  // มุมมองรวมตามรุ่น — เห็นทันทีว่ารุ่นไหนเหลือ/หมด (จากรายการที่กรองแล้ว)
  // รวมตาม รุ่น + เสา (MAST) — พิกัดยกอยู่ในชื่อรุ่นแล้ว (CPCD25=2.5ตัน) · เสาต่างกันแยกกลุ่ม
  const byModel = useMemo(() => {
    const m = new Map<string, { model: string; brand: string; mast: string; total: number; available: number; sold: number }>();
    listFiltered.forEach(f => {
      const mast = String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim();
      const key = `${f.brand}|${f.model}|${mast}`;
      const g = m.get(key) ?? { model: f.model || "(ไม่ระบุรุ่น)", brand: f.brand || "", mast, total: 0, available: 0, sold: 0 };
      g.total++;
      if (isAvailable(f.status)) g.available++;
      if (String(f.status) === "ปิดการขายแล้ว") g.sold++;
      m.set(key, g);
    });
    const rows = [...m.values()];
    if (listSort === "remain") rows.sort((a, b) => b.available - a.available); // เหลือเยอะขึ้นก่อน
    else if (listSort === "model") rows.sort((a, b) => a.model.localeCompare(b.model) || a.mast.localeCompare(b.mast));
    else rows.sort((a, b) => b.total - a.total);
    return rows;
  }, [listFiltered, listSort]);

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
            <button onClick={() => document.getElementById("stock-list")?.scrollIntoView({ behavior: "smooth" })}
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
          <StatCard label="เหลือ (พร้อมขาย)" value={available} onClick={() => showStatus("พร้อมขาย")} icon={<TrendingUp className="w-4 h-4" />} color="text-emerald-700" bg="bg-emerald-50 border-emerald-100" iconBg="bg-emerald-100 text-emerald-600" />
          <StatCard label="จอง"              value={reserved}  onClick={() => showStatus("จอง")} icon={<Boxes className="w-4 h-4" />}       color="text-amber-700"   bg="bg-amber-50 border-amber-100"   iconBg="bg-amber-100 text-amber-600" />
          <StatCard label="ติดไฟแนนซ์"       value={financing} onClick={() => showStatus("รอผ่านไฟแนนซ์")} icon={<Clock className="w-4 h-4" />}       color="text-rose-700"    bg="bg-rose-50 border-rose-100"     iconBg="bg-rose-100 text-rose-600" />
          <StatCard label="ขายไปแล้ว"        value={sold}      onClick={() => showStatus("ปิดการขายแล้ว")} icon={<CheckCircle className="w-4 h-4" />} color="text-indigo-700"  bg="bg-indigo-50 border-indigo-100" iconBg="bg-indigo-100 text-indigo-600" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {/* นำเข้าจากใบเสนอราคา (อ่าน PDF อัตโนมัติ) */}
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 px-3.5 py-3 text-left transition-colors">
              <FileText className="w-5 h-5 text-violet-600 flex-shrink-0" />
              <div className="min-w-0"><p className="text-sm font-bold text-violet-800">ใบเสนอราคา</p><p className="text-[11px] text-violet-600">อ่าน PDF อัตโนมัติ (HELI)</p></div>
            </button>
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

      </main>

      {/* ── Inventory List Modal ── */}
      {showImport && <QuoteImport onClose={() => setShowImport(false)} />}

      {/* ── รายการสต็อก (แสดงในหน้าหลักเลย ไม่ต้องเปิด modal) ── */}
      <section id="stock-list" className="max-w-4xl mx-auto w-full px-4 pb-10">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-800">รายการสต็อก</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {listView === "byModel"
                      ? `${byModel.length} รุ่น · ${listFiltered.length} คัน`
                      : `แสดง ${listFiltered.length} จาก ${forklifts.length} คัน`}
                  </p>
                </div>
              </div>
              {/* ค้นหา */}
              <input value={listSearch} onChange={e => setListSearch(e.target.value)}
                placeholder="ค้นหา SN / ยี่ห้อ / รุ่น / PI..."
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white text-slate-800 placeholder:text-slate-400" />
              {/* แท็กกรอง: ชนิดสินค้า */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {([
                  { key: "all" as CatFilter, label: "ทุกชนิด" },
                  ...VEHICLE_CATS.map(c => ({ key: c.key as CatFilter, label: `${c.icon} ${c.label}` })),
                ]).map(({ key, label }) => (
                  <Chip key={key} label={label} count={catCount(key)} active={listCat === key} onClick={() => setListCat(key)} />
                ))}
              </div>
              {/* แท็กกรอง: ยี่ห้อ (เลือกแล้วรีเซ็ตรุ่น/เสา) */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Chip label="ทุกยี่ห้อ" count={brandCount("all")} active={listBrand === "all"} onClick={() => { setListBrand("all"); setListModel("all"); setListMast("all"); }} />
                {brandList.map(([b, n]) => (
                  <Chip key={b} label={b} count={n} active={listBrand === b} onClick={() => { setListBrand(b); setListModel("all"); setListMast("all"); }} />
                ))}
              </div>
              {/* กรอง dropdown: รุ่น → เสา → พลังงาน (ไล่ระดับ) */}
              <div className="flex items-center gap-2 flex-wrap">
                <select value={listModel} onChange={e => { setListModel(e.target.value); setListMast("all"); }}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 max-w-[180px]">
                  <option value="all">ทุกรุ่น</option>
                  {modelOpts.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                {mastOpts.length > 0 && (
                  <select value={listMast} onChange={e => setListMast(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="all">ทุกเสา</option>
                    {mastOpts.map(m => <option key={m} value={m}>เสา {m}</option>)}
                  </select>
                )}
                <select value={listFuel} onChange={e => setListFuel(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="all">ทุกพลังงาน</option>
                  {fuelOpts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              {/* สถานะ + เรียง + มุมมอง */}
              <div className="flex items-center gap-2 flex-wrap">
                <select value={listStatus} onChange={e => setListStatus(e.target.value)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="all">ทุกสถานะ</option>
                  {fieldConfig.stockStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={listSort} onChange={e => setListSort(e.target.value as typeof listSort)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="recent">เรียง: เติมล่าสุด</option>
                  <option value="model">เรียง: ตามรุ่น</option>
                  <option value="sn">เรียง: ตาม SN</option>
                  {listView === "byModel" && <option value="remain">เรียง: เหลือเยอะสุด</option>}
                </select>
                {/* สลับมุมมอง รายคัน ↔ รวมตามรุ่น */}
                <div className="ml-auto flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                  <button onClick={() => setListView("list")}
                    className={`px-2.5 py-1.5 transition ${listView === "list" ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>รายคัน</button>
                  <button onClick={() => setListView("table")}
                    className={`px-2.5 py-1.5 transition ${listView === "table" ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ตาราง</button>
                  <button onClick={() => setListView("byModel")}
                    className={`px-2.5 py-1.5 transition ${listView === "byModel" ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ตามรุ่น</button>
                </div>
              </div>
            </div>
            <div className="overflow-auto max-h-[72vh] p-4 flex flex-col gap-2">
              {listFiltered.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">ไม่พบรถตามเงื่อนไข</div>
              )}

              {/* ── มุมมองตาราง (คอลัมน์ครบ) ── */}
              {listView === "table" && listFiltered.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-100">
                        {["รหัส", "ยี่ห้อ/รุ่น", "SN", "PI", "พิกัด", "พลังงาน", "ความสูง", "สถานะ", "ราคาต้นทุน", "โลเคชั่น", "เซลล์ดูแล", "เติมเมื่อ"].map((h, i) => (
                          <th key={i} className="px-2.5 py-2 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listFiltered.map((item) => (
                        <tr key={item.id} onClick={() => setDetailItem(item)}
                          className="border-b border-slate-50 hover:bg-emerald-50/40 cursor-pointer transition-colors">
                          <td className="px-2.5 py-2 whitespace-nowrap"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isPendingId(item.id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-500 bg-slate-100 border border-slate-200"}`}>#{item.id}</span></td>
                          <td className="px-2.5 py-2"><span className="font-semibold text-slate-800">{item.brand}</span> <span className="text-slate-500">{item.model}</span></td>
                          <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{item.SN || "—"}</td>
                          <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{item.pi_no || "—"}</td>
                          <td className="px-2.5 py-2 text-slate-600 whitespace-nowrap">{item.capacity || (item.capacity_kg ? `${item.capacity_kg} kg` : "—")}</td>
                          <td className="px-2.5 py-2 text-slate-600 whitespace-nowrap">{item.fuel || "—"}</td>
                          <td className="px-2.5 py-2 text-slate-600 whitespace-nowrap">{item.height || "—"}</td>
                          <td className="px-2.5 py-2 whitespace-nowrap"><StatusBadge status={item.status} /></td>
                          <td className="px-2.5 py-2 font-bold text-emerald-700 whitespace-nowrap">{item.cost_price ? `฿${item.cost_price.toLocaleString()}` : "—"}</td>
                          <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{item.location || "—"}</td>
                          <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{saleOwnerByFk.get(item.id) || (item.custom_fields?.["เซลล์ผู้ดูแล"] as string) || "—"}</td>
                          <td className="px-2.5 py-2 text-slate-400 whitespace-nowrap">{fmtAdded(item.created_at) || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── มุมมองรวมตามรุ่น: เห็นทันทีว่ารุ่นไหนเหลือ/หมด ── */}
              {listView === "byModel" && byModel.map(g => {
                const remainTone = g.available === 0
                  ? "bg-slate-100 text-slate-500 border-slate-200"          // หมด
                  : g.available <= 2
                    ? "bg-red-50 text-red-700 border-red-200"               // ใกล้หมด
                    : "bg-emerald-50 text-emerald-700 border-emerald-200";  // เหลือเยอะ
                return (
                  <button key={`${g.brand}|${g.model}|${g.mast}`}
                    onClick={() => { setListView("list"); setListSearch(""); setListBrand(g.brand || "all"); setListModel(g.model); setListMast(g.mast || "all"); }}
                    className="flex items-center gap-3 border border-slate-100 bg-slate-50 hover:bg-slate-100 rounded-xl p-3.5 text-left transition-colors">
                    <div className="bg-white border border-slate-200 rounded-xl p-2 flex-shrink-0 shadow-sm">
                      <Package className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{g.model}{g.mast ? <span className="text-emerald-600"> · เสา {g.mast}</span> : ""}</p>
                      <p className="text-xs text-slate-500">{g.brand || "ไม่ระบุยี่ห้อ"} · ทั้งหมด {g.total} คัน · ขายแล้ว {g.sold}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${remainTone}`}>
                      {g.available === 0 ? "หมด" : `เหลือ ${g.available}`}
                    </span>
                  </button>
                );
              })}

              {/* ── มุมมองรายคัน ── */}
              {listView === "list" && listFiltered.map((item, idx) => (
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
                    <p className="text-xs text-slate-500">{[
                      item.capacity || (item.capacity_kg ? `${item.capacity_kg} kg` : ""),
                      item.custom_fields?.["ประเภทสินค้า"],
                      item.fuel,
                      item.height ? `สูง ${item.height}` : "",
                      item.location,
                    ].filter(Boolean).join(" · ") || "—"}</p>
                    {saleOwnerByFk.get(item.id) && item.status !== "พร้อมขาย" && (
                      <p className="text-[11px] text-violet-700 mt-0.5 flex items-center gap-1 font-semibold"><User className="w-3 h-3 flex-shrink-0" />เซลล์: {saleOwnerByFk.get(item.id)}</p>
                    )}
                    {fmtAdded(item.created_at) && (
                      <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3 flex-shrink-0" />เติมเมื่อ {fmtAdded(item.created_at)}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0"><StatusBadge status={item.status} /></span>
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
      </section>

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
        const cf = it.custom_fields ?? {};
        const spec: [string, string][] = [
          ["หมวดรถ", it.vehicle_category ?? ""],
          ["ยี่ห้อ", it.brand],
          ["รุ่น", it.model],
          ["ประเภทสินค้า", cf["ประเภทสินค้า"] ?? ""],
          ["พิกัดยก", it.capacity ?? ""],
          ["น้ำหนักยก", it.capacity_kg ? fmtCap(it.capacity_kg) : ""],
          ["ยกสูง", it.height ?? ""],
          ["เสา (MAST)", cf["MAST"] ?? ""],
          ["Valve / คอนโทรล", cf["Valve"] ?? it.control_type ?? ""],
          ["ขนาดงา", cf["ขนาดงา"] ?? ""],
          ["ความยาวงา", it.fork_length ? `${it.fork_length} มม.` : ""],
          ["พลังงาน", it.fuel],
        ];
        const info: [string, string][] = [
          ["เซลล์เจ้าของงาน", it.status !== "พร้อมขาย" ? (saleOwnerByFk.get(it.id) ?? cf["เซลล์ผู้ดูแล"] ?? "") : ""],
          ["ลูกค้า", cf["รายละเอียด (ลูกค้า)"] ?? ""],
          ["SALE CONTRACT / PI", it.pi_no ?? ""],
          ["เลขที่ใบกำกับภาษี", cf["เลขที่ใบกำกับภาษี"] ?? ""],
          ["วันรับรถ", it.received_date ?? ""],
          ["ราคาทุน", it.cost_price ? `฿${it.cost_price.toLocaleString()}` : ""],
          ["โลเคชั่น", it.location ?? ""],
          ["เติมเข้าสต็อกเมื่อ", fmtAdded(it.created_at)],
        ];
        // custom_fields ที่โชว์ในสเปก/ข้อมูลแล้ว + คีย์ internal → ไม่ต้องโชว์ซ้ำใน "ข้อมูลเพิ่มเติม"
        const SHOWN_CF = new Set(["ประเภทสินค้า","MAST","Valve","ขนาดงา","เซลล์ผู้ดูแล","รายละเอียด (ลูกค้า)","เลขที่ใบกำกับภาษี","ชีตต้นทาง"]);
        const customs = Object.entries(cf).filter(([k, v]) => String(v ?? "").trim() && !SHOWN_CF.has(k));
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
                    <StatusBadge status={it.status} />
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

function StatCard({ label, value, icon, color, bg, iconBg, onClick }: {
  label: string; value: number; icon: React.ReactNode; color: string; bg: string; iconBg: string; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className={`${bg} border rounded-2xl p-4 flex flex-col gap-2 text-left transition-all ${onClick ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer" : "cursor-default"}`}>
      <div className={`${iconBg} rounded-lg p-1.5 w-fit`}>{icon}</div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-600 font-medium">{label}</p>
    </button>
  );
}

