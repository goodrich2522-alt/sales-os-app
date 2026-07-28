"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp, LogOut, X, CheckCircle, AlertCircle,
  Search, Fuel, Zap, Filter, ChevronRight, Target,
  Package, Trash2, History, RotateCcw, Pencil, Check, Camera,
  SlidersHorizontal, ImageOff, ZoomIn, ChevronLeft, Plus, ClipboardList,
  Settings, ChevronDown, Type, ListOrdered, ArrowLeft, Bell, Eye, ChevronUp, RefreshCw,
  LayoutGrid, Table as TableIcon, Users,
} from "lucide-react";
import { PROVINCES, CONTACT_SOURCES } from "@/lib/mockData";
import { Forklift, PaymentType, CustomerType, Sale, SaleStatus, VehicleType, ContactSource, SaleType, InspectionRecord, SLOT_LABELS } from "@/lib/types";
import { useApp } from "@/lib/AppContext";
import { driveImg } from "@/lib/img";
import { isPendingId } from "@/lib/productId";
import { STATUS_BADGE, SALE_STATUS_BADGE, CONTACT_SOURCE_COLORS, VEHICLE_CATS } from "@/lib/constants";
import { formatBaht } from "@/lib/format";
import { hasActiveSession, signOutSupabase } from "@/lib/auth";
import { apiEnabled } from "@/lib/api";
import AiAssistant from "@/components/AiAssistant";

// ── ตรรกะว่ารถคันไหน "ยังขายได้" (โชว์ให้เซลล์) ──────────────────────────────
// ใช้ blocklist แทน whitelist: ซ่อนเฉพาะรถที่ "ชัดเจนว่าไม่ว่าง" (ขายแล้ว/เช่า/รอรับ/ส่งมอบ)
// ที่เหลือโชว์หมด — กันรถว่างหายจากจอเพราะสถานะพิมพ์ไม่ตรง (ข้อมูลใน DB มีหลายสะกด เช่น
// "ขายแล้ว/ไฟแนนซ์", "ขายแล้วเงินสด", "รถเช่า GR-197") · "รอผ่านไฟแนนซ์" = ยังตามได้ ไม่ซ่อน
// คืนข้อความเหตุผลถ้าถูกซ่อน · คืน null ถ้ายังขายได้
function notSellableReason(status: unknown): string | null {
  const s = (status == null ? "" : String(status)).trim();
  if (s === "") return null; // ไม่มีสถานะ = ให้โชว์ไว้ก่อน (ดีกว่าซ่อนรถจริง)
  // ── สถานะที่ถูกจับจอง/ขายแล้ว → กันสต็อก ไม่ให้เปิดขายซ้ำ (รวม 4 สถานะใหม่) ──
  if (s.includes("ขายแล้ว") || s.includes("ขายเงินสด") || s.includes("ปิดการขาย")) return "ปิดการขายแล้ว";
  if (s.includes("ส่งมอบ") || s.includes("จัดส่งแล้ว")) return "ส่งมอบแล้ว";
  if (s.includes("รอจัดส่ง")) return "รอจัดส่ง";
  if (s.includes("มัดจำ") || s.includes("จอง")) return "จอง/มัดจำแล้ว";
  if (s.includes("ไฟแนนซ์")) return "รอไฟแนนซ์";
  if (s.includes("เช่า")) return "เป็นรถเช่า";
  if (s.includes("รอรับ") || s.includes("รอเข้าไปรับ")) return "ยังไม่รับรถเข้าคลัง (รอรับ)";
  return null;
}
const isSellable = (f: { status?: unknown }) => notSellableReason(f?.status) === null;

const emptyCheckout = {
  customer_name: "", customer_tel: "",
  customer_type: "" as CustomerType | "",
  province: "", payment_type: "" as PaymentType | "",
  finance_company: "", actual_sale: "", deposit: "",
  delivery_date: "", remark: "",
  warranty_expiry: "", parts_schedule: "",
  contact_source: "" as ContactSource | "",
  sale_type: "" as SaleType | "",
};

type SaleInlineStep = "name" | "type" | "options" | null;

const SALE_FIELD_LABELS: Record<string, string> = {
  saleTypes: "ประเภทการขาย",
  paymentTypes: "ประเภทการชำระ",
  customerTypes: "ประเภทลูกค้า",
  financeCompanies: "บริษัทไฟแนนซ์",
};
type SaleDropdown = "saleTypes" | "paymentTypes" | "customerTypes" | "financeCompanies";

const HISTORY_TABS: { key: SaleStatus | "all"; label: string }[] = [
  { key: "all",                    label: "ทั้งหมด" },
  { key: "มัดจำแล้ว",              label: "มัดจำแล้ว" },
  { key: "รอจัดส่ง",               label: "รอจัดส่ง" },
  { key: "รอไฟแนนซ์",             label: "รอไฟแนนซ์" },
  { key: "ปิดการขาย/จัดส่งแล้ว",   label: "ปิด/ส่งแล้ว" },
];

// อุปกรณ์เสริมติดตั้ง (Add-On) — ราคาเติมเอง (เฟส 4)
const ADDON_OPTIONS = ["Side Shifter", "Fork Positioner", "Bale Clamp", "Rotator", "Boom", "Carpet Ram", "Paper Roll Clamp", "Brick Clamp", "Hingfork", "Bucket"];

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// รูปพร้อมป้ายกำกับช่อง (Name Plate / เอกสาร PI / รถ 4 มุม) — รูปเก่าไม่มีช่อง = ป้ายว่าง
type LabeledPhoto = { url: string; label: string };
function labeledPhotos(recs: InspectionRecord[]): LabeledPhoto[] {
  return recs.flatMap(r => {
    const urlToLabel = new Map(
      Object.entries(r.image_slots ?? {}).map(([k, v]) => [v as string, SLOT_LABELS[k] ?? k])
    );
    return (r.images ?? []).map(url => ({ url, label: urlToLabel.get(url) ?? "" }));
  });
}

export default function SalesMain() {
  const router = useRouter();
  const {
    forklifts, sales, addSale, updateSale, deleteSale, inspections, fieldConfig, refresh,
    updateFieldOptions,
    addSaleExtraFieldDef, removeSaleExtraFieldDef, renameSaleExtraFieldDef,
    addSaleExtraFieldOption, removeSaleExtraFieldOption, editSaleExtraFieldOption,
    addSalesFilterRequest, removeSalesFilterRequest,
  } = useApp();

  const [salesUser, setSalesUser] = useState<{ name: string; target_monthly: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => { setRefreshing(true); await refresh(); setTimeout(() => setRefreshing(false), 400); };
  const [search, setSearch]       = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest"); // เรียงตามวันที่เข้าสต็อก
  const [viewMode, setViewMode]   = useState<"card" | "table" | "byModel">("card"); // มุมมอง: การ์ด/ตาราง/ตามรุ่น
  const [selected, setSelected]   = useState<Forklift | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null); // ไม่ null = กำลังแก้ไขดีลเดิม
  const [form, setForm]           = useState(emptyCheckout);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [undoToast, setUndoToast]         = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput]     = useState("");
  const [historyTab, setHistoryTab]       = useState<SaleStatus | "all">("all");
  const [historyView, setHistoryView]     = useState<"deals" | "customers">("deals"); // ดีลของฉัน / ลูกค้าของฉัน
  const [detailSale, setDetailSale]       = useState<Sale | null>(null);
  const [cancelBox, setCancelBox]         = useState(false);   // กล่องยกเลิกการจอง
  const [cancelReason, setCancelReason]   = useState("");      // เหตุผลการยกเลิก
  const [addOns, setAddOns]               = useState<{ name: string; price: number }[]>([]); // อุปกรณ์เสริม (เฟส 4)
  const [newAddon, setNewAddon]           = useState({ name: "", price: "" });
  const [freebie, setFreebie]             = useState(false);   // ของแถมเซ็ท 2,800 (เฟส 5)
  const [shippingCost, setShippingCost]   = useState("");      // ค่าขนส่งจากซัพพลายเออร์
  const [showNotif, setShowNotif]         = useState(true);
  const [detailLightboxIdx, setDetailLightboxIdx] = useState<number | null>(null);

  // Vehicle category tabs (main product separator)
  const [activeCategory, setActiveCategory] = useState<"all" | VehicleType>("all");

  // Test notification demo
  const [testNotifActive, setTestNotifActive] = useState(false);

  // Vehicle type selector in checkout (auto-set from product category)
  const [vehicleType, setVehicleType] = useState<VehicleType>("Forklift");

  // Custom notification items in checkout
  const [showCustomNotifs, setShowCustomNotifs] = useState(false);
  const [customNotifItems, setCustomNotifItems] = useState<{ label: string; date: string }[]>([]);
  const [newNotifLabel, setNewNotifLabel] = useState("");
  const [newNotifDate, setNewNotifDate] = useState("");

  // Cascade filter
  const [showFilter, setShowFilter] = useState(false);
  const [fBrand, setFBrand]       = useState("");
  const [fModel, setFModel]       = useState("");
  const [fFuel, setFFuel]         = useState("");
  const [fCapacity, setFCapacity] = useState("");
  const [fHeight, setFHeight]     = useState("");
  const [fMast, setFMast]         = useState(""); // กรองความสูงเสา (MAST) — ใช้ตอนคลิกการ์ดตามรุ่น
  const [extraFilterVals, setExtraFilterVals] = useState<Record<string, string>>({});
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [newFilterName, setNewFilterName] = useState("");

  // Category-specific spec filters (shown below category tabs)
  const [fSpecModel, setFSpecModel]   = useState("");
  const [fSpecSN, setFSpecSN]         = useState("");
  const [fForkLength, setFForkLength] = useState("");
  const [fForkWidth, setFForkWidth]   = useState("");

  // Checkout custom fields
  const [saleCustomVals, setSaleCustomVals]   = useState<Record<string, string>>({});
  const [lightboxIdx, setLightboxIdx]         = useState<number | null>(null);
  const [paymentProof, setPaymentProof]       = useState(""); // รูปหลักฐานการชำระเงิน (บังคับ)
  const paymentInputRef = useRef<HTMLInputElement>(null);

  // ย่อรูปเป็น dataURL (ยาวสุด 1000px, jpeg 78%) — ใช้กับหลักฐานการชำระเงิน
  const fileToResizedDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => {
        if (!ev.target?.result) { reject(new Error("read fail")); return; }
        const img = new Image();
        img.onload = () => {
          const MAX = 1000;
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.78));
        };
        img.src = ev.target.result as string;
      };
      reader.readAsDataURL(file);
    });
  const handlePaymentProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setPaymentProof(await fileToResizedDataUrl(file));
  };

  // ── Settings modal state ───────────────────────────────────────────────────
  const [showSettings, setShowSettings]         = useState(false);
  const [editingSaleField, setEditingSaleField] = useState<SaleDropdown | null>(null);
  const [sNewOpt, setSNewOpt]                   = useState("");
  const [sEditOpt, setSEditOpt]                 = useState<{ idx: number; val: string } | null>(null);
  const [expandedSefId, setExpandedSefId] = useState<string | null>(null);
  const [editingSefId, setEditingSefId]   = useState<string | null>(null);
  const [editingSefVal, setEditingSefVal] = useState("");
  const [sefNewOpt, setSefNewOpt]         = useState("");
  const [sefEditOpt, setSefEditOpt]       = useState<{ idx: number; val: string } | null>(null);
  const [sefStep, setSefStep]         = useState<SaleInlineStep>(null);
  const [sefName, setSefName]         = useState("");
  const [sefType, setSefType]         = useState<"text" | "select">("text");
  const [sefOptions, setSefOptions]   = useState<string[]>([]);
  const [sefOptInput, setSefOptInput] = useState("");

  useEffect(() => {
    const u = localStorage.getItem("sales_user");
    if (!u) { router.push("/sales/login"); return; }
    setSalesUser(JSON.parse(u));
    // มีข้อมูลค้างแต่ session Supabase หมดอายุ/ไม่มี → บังคับล็อกอินใหม่ (กันเซฟไม่เข้าแบบเงียบๆ)
    (async () => {
      if (apiEnabled && !(await hasActiveSession())) {
        localStorage.removeItem("sales_user");
        router.push("/sales/login");
      }
    })();
  }, [router]);

  // อ่านค่าความสูงเสา (MAST) จาก custom_fields อย่างปลอดภัย
  const mastOf = (f: typeof forklifts[number]) => String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim();

  const available = forklifts.filter(isSellable);
  const readyCount = available.filter(f => String(f.status).trim() === "พร้อมขาย").length;
  const brands     = [...new Set(available.map(f => f.brand).filter(Boolean))].sort();
  const models     = [...new Set(available.filter(f => !fBrand || f.brand === fBrand).map(f => f.model).filter(Boolean))].sort();
  const fuels      = [...new Set(available.map(f => f.fuel).filter(Boolean))].sort();
  const masts      = [...new Set(available.filter(f => (!fBrand || f.brand === fBrand) && (!fModel || f.model === fModel)).map(mastOf).filter(Boolean))].sort();
  const capacities = [...new Set(available.filter(f => (!fBrand || f.brand === fBrand) && (!fModel || f.model === fModel)).map(f => f.capacity).filter(Boolean))].sort();
  const heights    = [...new Set(available.filter(f => (!fBrand || f.brand === fBrand) && (!fModel || f.model === fModel)).map(f => f.height).filter(Boolean))].sort();
  const hasFilter  = !!(fBrand || fModel || fMast || fFuel || fCapacity || fHeight || search || fSpecModel || fSpecSN || fForkLength || fForkWidth);

  // แปลงค่าใดๆ เป็น string ตัวพิมพ์เล็กอย่างปลอดภัย (กัน .toLowerCase บน undefined → จอเด้ง)
  const hay = (v: unknown) => (v == null ? "" : String(v)).toLowerCase();

  // แปลงความสูงเป็น "เมตร" — รับได้ทั้ง "4" (เมตร) และ "3000 MM" (มม.) · รหัสเสา (M400) ไม่เดา ให้สต๊อกกรอกจริง
  const toMeters = (v: unknown): number | null => {
    const s = (v == null ? "" : String(v)).trim().toLowerCase();
    const m = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(mm|ม)?/);
    if (!m || !m[1]) return null;
    let n = Number(m[1]);
    if (!isFinite(n) || n <= 0) return null;
    if (m[2] === "mm" || n > 100) n = n / 1000; // ตัวเลขใหญ่ = มม.
    return n;
  };

  const filtered = available.filter(f => {
    const q = search.trim().toLowerCase();
    const base =
      (!q || hay(f.id).includes(q) || hay(f.SN).includes(q) || hay(f.brand).includes(q) || hay(f.model).includes(q)) &&
      (!fBrand    || f.brand === fBrand) &&
      (!fModel    || f.model === fModel) &&
      (!fMast     || mastOf(f) === fMast) &&
      (!fFuel     || hay(f.fuel) === fFuel.toLowerCase()) &&
      (!fCapacity || Number(f.capacity_kg) === Number(fCapacity)) &&
      (!fHeight   || toMeters(f.height) === Number(fHeight));
    const cat = activeCategory === "all" || (f.vehicle_category ?? "Forklift") === activeCategory;
    const spec =
      (!fSpecModel  || hay(f.model).includes(fSpecModel.toLowerCase())) &&
      (!fSpecSN     || hay(f.SN).includes(fSpecSN.toLowerCase())) &&
      (!fForkLength || hay(f.fork_length).includes(fForkLength.toLowerCase())) &&
      (!fForkWidth  || hay([f.fork_length, f.attachments, JSON.stringify(f.custom_fields ?? {})].join(" ")).includes(fForkWidth.toLowerCase()));
    return base && cat && spec;
  });

  // เรียงตามวันที่เข้าสต็อก (created_at) — ล่าสุด/เก่าสุด
  const sorted = [...filtered].sort((a, b) => {
    const ta = String(a.created_at || ""), tb = String(b.created_at || "");
    const cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
    return sortOrder === "newest" ? -cmp : cmp;
  });

  // ── เฟส B: สรุปคงเหลือตามรุ่น (จากรายการที่กรองแล้ว) — เห็นว่ารุ่นไหนเหลือเยอะ/ใกล้หมด ──
  const byModel = useMemo(() => {
    const m = new Map<string, { brand: string; model: string; mast: string; ready: number; capacity: string; fuel: string }>();
    // นับเฉพาะรถ "พร้อมขาย" จริง (พร้อมปิดการขายได้) — ไม่รวมจอง/ขายแล้ว/สั่งผลิต
    sorted.filter((f) => String(f.status).trim() === "พร้อมขาย").forEach((f) => {
      const mast = String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim();
      const key = `${f.brand}|${f.model}|${mast}`;
      const g = m.get(key) ?? { brand: f.brand, model: f.model, mast, ready: 0, capacity: f.capacity || (f.capacity_kg ? `${f.capacity_kg} kg` : ""), fuel: f.fuel || "" };
      g.ready++;
      m.set(key, g);
    });
    return [...m.values()].sort((a, b) => b.ready - a.ready);
  }, [sorted]);

  // ── งาน 4: ถ้าค้นด้วยรหัส/SN แล้วไม่เจอในรายการขาย แต่รถมีอยู่จริง (สถานะขายแล้ว/เช่า ฯลฯ)
  //    → บอกเซลล์ว่าเจอรถแต่ถูกซ่อนเพราะอะไร (กันเข้าใจผิดว่า "ข้อมูลหาย") ──
  const searchHiddenHit = (() => {
    const q = search.trim().toLowerCase();
    if (!q || sorted.length > 0) return null;
    const hit = forklifts.find(f =>
      (hay(f.id) === q || hay(f.SN) === q || hay(f.id).includes(q) || hay(f.SN).includes(q)) &&
      notSellableReason(f.status) !== null
    );
    return hit ? { f: hit, reason: notSellableReason(hit.status)! } : null;
  })();

  const clearFilters = () => {
    setFBrand(""); setFModel(""); setFMast(""); setFFuel(""); setFCapacity(""); setFHeight("");
    setSearch(""); setExtraFilterVals({});
    setFSpecModel(""); setFSpecSN(""); setFForkLength(""); setFForkWidth("");
  };
  const mySales = salesUser ? sales.filter(s => s.sales_staff === salesUser.name) : [];
  // ลูกค้าของฉัน — รวมดีลตามลูกค้า (ชื่อ+เบอร์) เห็นว่าลูกค้าแต่ละคนซื้ออะไรบ้าง
  const myCustomers = useMemo(() => {
    const m = new Map<string, { name: string; tel: string; province: string; deals: Sale[] }>();
    mySales.forEach(s => {
      const key = `${s.customer_name}|${s.customer_tel}`;
      const g = m.get(key) ?? { name: s.customer_name || "ไม่ระบุชื่อ", tel: s.customer_tel || "", province: s.province || "", deals: [] };
      g.deals.push(s);
      m.set(key, g);
    });
    return [...m.values()].sort((a, b) => b.deals.length - a.deals.length);
  }, [mySales]);

  // Notifications — sales with warranty/parts approaching
  const notifications = useMemo(() => {
    const result: { sale: Sale; type: "warranty" | "parts" | "custom"; days: number; label?: string }[] = [];
    mySales.forEach(s => {
      if (s.warranty_expiry) {
        const d = daysUntil(s.warranty_expiry);
        if (d >= 0 && d <= 7) result.push({ sale: s, type: "warranty", days: d });
      }
      if (s.parts_schedule) {
        const d = daysUntil(s.parts_schedule);
        if (d >= 0 && d <= 7) result.push({ sale: s, type: "parts", days: d });
      }
      (s.custom_notifications ?? []).forEach(n => {
        const d = daysUntil(n.date);
        if (d >= 0 && d <= 7) result.push({ sale: s, type: "custom", days: d, label: n.label });
      });
    });
    if (testNotifActive) {
      result.unshift({
        sale: { id: "__test__", forklift_unit_no: "TEST-001", customer_name: "ลูกค้าทดสอบ" } as Sale,
        type: "warranty", days: 3, label: "การแจ้งเตือนทดสอบ",
      });
    }
    return result;
  }, [mySales, testNotifActive]);

  const detailInspPhotos = useMemo(() => {
    if (!detailSale) return { receiver: [] as LabeledPhoto[], deliverer: [] as LabeledPhoto[], all: [] as LabeledPhoto[], receiverNames: "", delivererNames: "" };
    const recs = inspections.filter(r => r.unit_no === detailSale.forklift_unit_no);
    const recvRecs = recs.filter(r => r.role === "ผู้รับรถ" || !r.role);
    const delivRecs = recs.filter(r => r.role === "ผู้ส่งมอบรถ");
    const receiver  = labeledPhotos(recvRecs);
    const deliverer = labeledPhotos(delivRecs);
    const names = (rs: typeof recs) => [...new Set(rs.map(r => r.transporter_name).filter(Boolean))].join(", ");
    return { receiver, deliverer, all: [...receiver, ...deliverer], receiverNames: names(recvRecs), delivererNames: names(delivRecs) };
  }, [detailSale, inspections]);

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
    if (!paymentProof) e.payment_proof = "กรุณาแนบรูปหลักฐานการชำระเงิน (บังคับ)";
    return e;
  };

  const buildSale = (status: SaleStatus): Sale => {
    const customFields: Record<string, string> = {};
    fieldConfig.saleExtraFieldDefs.forEach(def => {
      if (saleCustomVals[def.id]?.trim()) customFields[def.name] = saleCustomVals[def.id].trim();
    });
    // ข้อมูลรถจากสต็อก — เติมให้อัตโนมัติ ไม่ต้องให้เซลล์กรอกเอง
    if (selected) {
      const auto: Record<string, string> = {
        "รหัสสินค้า": selected.id !== selected.SN ? String(selected.id) : "",
        PI: selected.pi_no ?? "", MODEL: selected.model ?? "",
        Valve: selected.control_type ?? "", SN: selected.SN ?? "",
        "วันรับรถ": selected.received_date ?? "",
      };
      Object.entries(auto).forEach(([k, v]) => { if (v) customFields[k] = String(v); });
    }
    return {
      // แก้ไข = คง id/วันที่เดิม · ทำใหม่ = ออก id ใหม่
      id: editingSale ? editingSale.id : `sale_${Date.now()}`,
      forklift_id: selected!.id, forklift_unit_no: selected!.SN,
      forklift_brand: selected!.brand, forklift_model: selected!.model,
      sales_staff: salesUser?.name ?? "",
      customer_name: form.customer_name, customer_tel: form.customer_tel,
      customer_type: form.customer_type as CustomerType, province: form.province,
      payment_type: form.payment_type as PaymentType,
      finance_company: form.finance_company || undefined,
      actual_sale: Number(form.actual_sale), deposit: Number(form.deposit) || 0,
      delivery_date: form.delivery_date, remark: form.remark || undefined,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : undefined,
      sale_status: status,
      vehicle_type: vehicleType,
      warranty_expiry: form.warranty_expiry || undefined,
      parts_schedule: form.parts_schedule || undefined,
      custom_notifications: customNotifItems.length > 0 ? customNotifItems : undefined,
      contact_source: (form.contact_source as ContactSource) || undefined,
      sale_type: (form.sale_type as SaleType) || undefined,
      payment_proof: paymentProof || undefined,
      add_ons: addOns.length ? addOns : undefined,
      freebie: freebie || undefined,
      shipping_cost: shippingCost ? Number(shippingCost) : undefined,
      created_at: editingSale ? editingSale.created_at : new Date().toISOString().slice(0, 10),
    };
  };

  // บันทึกดีล — ทำใหม่ = addSale · แก้ไขของเดิม = updateSale
  const commitSale = (status: SaleStatus) => {
    const s = buildSale(status);
    if (editingSale) updateSale(s); else addSale(s);
    setSubmitted(true);
    setTimeout(resetCheckout, editingSale ? 1400 : 3000);
  };

  // เปิดฟอร์มแก้ไขดีลที่ทำไปแล้ว — เติมข้อมูลเดิมกลับเข้าฟอร์มทั้งหมด
  const openEditSale = (sale: Sale) => {
    // หารถจากสต็อก ถ้าถูกลบไปแล้วสร้างรถชั่วคราวจากข้อมูลในดีล เพื่อให้ฟอร์มทำงานต่อได้
    const fk = forklifts.find(f => f.id === sale.forklift_id) ?? {
      id: sale.forklift_id, SN: sale.forklift_unit_no, brand: sale.forklift_brand,
      model: sale.forklift_model, capacity: "", height: "", fuel: "", cost_price: 0,
      stock_price: 0, status: "", created_at: sale.created_at,
    } as Forklift;
    setEditingSale(sale);
    setSelected(fk);
    setVehicleType(sale.vehicle_type ?? fk.vehicle_category ?? "Forklift");
    setForm({
      customer_name: sale.customer_name ?? "", customer_tel: sale.customer_tel ?? "",
      customer_type: (sale.customer_type ?? "") as CustomerType | "",
      province: sale.province ?? "", payment_type: (sale.payment_type ?? "") as PaymentType | "",
      finance_company: sale.finance_company ?? "",
      actual_sale: sale.actual_sale ? String(sale.actual_sale) : "",
      deposit: sale.deposit ? String(sale.deposit) : "",
      delivery_date: sale.delivery_date ?? "", remark: sale.remark ?? "",
      warranty_expiry: sale.warranty_expiry ?? "", parts_schedule: sale.parts_schedule ?? "",
      contact_source: (sale.contact_source ?? "") as ContactSource | "",
      sale_type: (sale.sale_type ?? "") as SaleType | "",
    });
    // เติมค่าช่องที่เพิ่มเอง (จับคู่ตามชื่อ)
    const cvals: Record<string, string> = {};
    fieldConfig.saleExtraFieldDefs.forEach(def => {
      const v = sale.custom_fields?.[def.name];
      if (v != null) cvals[def.id] = String(v);
    });
    setSaleCustomVals(cvals);
    setCustomNotifItems(sale.custom_notifications ?? []);
    setShowCustomNotifs((sale.custom_notifications ?? []).length > 0);
    setPaymentProof(sale.payment_proof ?? "");
    setAddOns(sale.add_ons ?? []);
    setFreebie(sale.freebie ?? false);
    setShippingCost(sale.shipping_cost ? String(sale.shipping_cost) : "");
    setErrors({}); setSubmitted(false); setLightboxIdx(null);
    setDetailSale(null); // ปิดหน้ารายละเอียดถ้าเปิดอยู่
  };

  const resetCheckout = () => {
    setSelected(null); setEditingSale(null); setForm(emptyCheckout); setErrors({}); setSaleCustomVals({});
    setSubmitted(false); setCustomNotifItems([]); setShowCustomNotifs(false);
    setNewNotifLabel(""); setNewNotifDate(""); setPaymentProof("");
    setAddOns([]); setNewAddon({ name: "", price: "" }); setCancelBox(false); setCancelReason("");
    setFreebie(false); setShippingCost("");
  };

  // เปิดฟอร์มปิดการขายของรถคันหนึ่ง (ใช้ร่วมทั้งมุมมองการ์ดและตาราง)
  const openCheckout = (item: Forklift) => {
    setSelected(item); setForm(emptyCheckout); setErrors({}); setSubmitted(false);
    setLightboxIdx(null); setSaleCustomVals({}); setVehicleType(item.vehicle_category ?? "Forklift");
    setCustomNotifItems([]); setShowCustomNotifs(false); setNewNotifLabel(""); setNewNotifDate("");
  };

  // ตรวจฟอร์มแล้วบันทึกดีลด้วยสถานะที่เลือก (ใช้ร่วมทุกปุ่ม)
  const submitSale = (status: SaleStatus) => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    commitSale(status);
  };
  const handleSell = (e: React.FormEvent) => { e.preventDefault(); submitSale("ปิดการขาย/จัดส่งแล้ว"); };
  const handleBook = (e: React.MouseEvent) => { e.preventDefault(); submitSale("มัดจำแล้ว"); };
  const handleShipping = (e: React.MouseEvent) => { e.preventDefault(); submitSale("รอจัดส่ง"); };
  const handleFinance = (e: React.MouseEvent) => { e.preventDefault(); submitSale("รอไฟแนนซ์"); };

  // ยกเลิกการจอง (รถที่ยังไม่ปิดขาด) — คืนรถสู่สต็อก + เก็บเหตุผลไว้ใน remark
  const cancelBooking = () => {
    if (!detailSale) return;
    const reason = cancelReason.trim() || "ไม่ระบุเหตุผล";
    updateSale({ ...detailSale, remark: `${detailSale.remark ? detailSale.remark + " · " : ""}ยกเลิกการจอง: ${reason}` });
    deleteSale(detailSale.id);
    setUndoToast(`ยกเลิกการจอง ${detailSale.forklift_unit_no} — รถกลับสู่สต็อก (${reason})`);
    setTimeout(() => setUndoToast(null), 4000);
    setDetailSale(null); setCancelBox(false); setCancelReason("");
  };

  const handleUpdateTarget = () => {
    const n = Number(targetInput.replace(/,/g, ""));
    if (!isNaN(n) && n > 0 && salesUser) {
      const updated = { ...salesUser, target_monthly: n };
      setSalesUser(updated); localStorage.setItem("sales_user", JSON.stringify(updated));
    }
    setEditingTarget(false);
  };

  const handleDeleteSale = (saleId: string) => {
    const sale = sales.find(s => s.id === saleId);
    deleteSale(saleId); setDeleteConfirm(null);
    if (sale) { setUndoToast(`ลบรายการ ${sale.forklift_unit_no} แล้ว — รถกลับสู่สต็อก`); setTimeout(() => setUndoToast(null), 4000); }
  };

  const fmt = formatBaht; // ใช้ตัวจัดรูปแบบเงินกลาง (lib/format)
  const selectedInspRecs = selected ? inspections.filter(r => r.unit_no === selected.SN) : [];
  const receiverPhotos   = labeledPhotos(selectedInspRecs.filter(r => r.role === "ผู้รับรถ" || !r.role));
  const delivererPhotos  = labeledPhotos(selectedInspRecs.filter(r => r.role === "ผู้ส่งมอบรถ"));
  const receiverNames    = [...new Set(selectedInspRecs.filter(r => r.role === "ผู้รับรถ" || !r.role).map(r => r.transporter_name).filter(Boolean))].join(", ");
  const delivererNames   = [...new Set(selectedInspRecs.filter(r => r.role === "ผู้ส่งมอบรถ").map(r => r.transporter_name).filter(Boolean))].join(", ");
  const selectedPhotos   = [...receiverPhotos, ...delivererPhotos]; // combined for lightbox

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

  const resetSefWizard = () => { setSefStep(null); setSefName(""); setSefType("text"); setSefOptions([]); setSefOptInput(""); };
  const addSefOption = () => { if (!sefOptInput.trim()) return; setSefOptions(p => [...p, sefOptInput.trim()]); setSefOptInput(""); };
  const commitSef = () => {
    if (!sefName.trim()) return;
    addSaleExtraFieldDef(sefName, sefType, sefType === "select" ? sefOptions : []);
    resetSefWizard();
  };

  const confirmAddFilter = () => {
    if (!newFilterName.trim()) return;
    addSalesFilterRequest(newFilterName.trim()); setNewFilterName(""); setShowAddFilter(false);
  };

  const filteredHistory = historyTab === "all"
    ? mySales
    : mySales.filter(s => (s.sale_status ?? "ขายแล้ว") === historyTab);

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
            <button onClick={handleRefresh} title="รีเฟรชข้อมูลล่าสุด"
              className="flex items-center gap-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-emerald-200">
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-600" : ""}`} /><span className="hidden sm:inline">รีเฟรช</span>
            </button>
            {notifications.length > 0 && (
              <button onClick={() => setShowNotif(!showNotif)}
                className="relative flex items-center gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-amber-200">
                <Bell className="w-4 h-4" />
                <span className="bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{notifications.length}</span>
              </button>
            )}
            <button
              onClick={() => { setTestNotifActive(p => !p); setShowNotif(true); }}
              title="ทดสอบการแจ้งเตือน"
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${testNotifActive ? "bg-amber-100 text-amber-700 border-amber-300" : "text-slate-500 border-dashed border-slate-300 hover:border-amber-300 hover:text-amber-600"}`}>
              <Bell className="w-3.5 h-3.5" />ทดสอบ
            </button>
            <button onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-indigo-200">
              <History className="w-4 h-4" /><span className="hidden sm:inline">การขายของฉัน ({mySales.length})</span>
            </button>
            <button onClick={() => { void signOutSupabase(); localStorage.removeItem("sales_user"); router.push("/sales/login"); }}
              className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">ออก</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Notification Banner */}
        {notifications.length > 0 && showNotif && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-bold text-amber-800">การแจ้งเตือน ({notifications.length} รายการ)</span>
              </div>
              <button onClick={() => setShowNotif(false)} className="text-amber-500 hover:text-amber-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-col gap-2">
              {notifications.map((n, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${n.days <= 1 ? "bg-red-100 border border-red-200" : "bg-amber-100 border border-amber-200"}`}>
                  <span className={`font-bold text-xs px-2 py-0.5 rounded-full ${n.days <= 1 ? "bg-red-500 text-white" : "bg-amber-500 text-white"}`}>
                    {n.days === 0 ? "วันนี้!" : `อีก ${n.days} วัน`}
                  </span>
                  <span className={`font-semibold ${n.days <= 1 ? "text-red-800" : "text-amber-800"}`}>
                    {n.sale.forklift_unit_no} — {n.sale.customer_name}
                  </span>
                  <span className={`text-xs ${n.days <= 1 ? "text-red-600" : "text-amber-600"}`}>
                    {n.type === "warranty" ? "ประกันรถหมดอายุ" : n.type === "parts" ? "ถึงรอบเปลี่ยนอะไหล่" : (n.label ?? "การแจ้งเตือนพิเศษ")}
                  </span>
                  {n.sale.id === "__test__" && (
                    <span className="text-xs bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-semibold ml-1">TEST</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Banner */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-blue-800 rounded-2xl p-5 text-white relative overflow-hidden shadow-lg shadow-indigo-200">
          <div className="absolute right-0 top-0 w-48 h-full bg-white/5 rounded-l-full" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3"><Package className="w-7 h-7 text-white" /></div>
              <div>
                <p className="text-indigo-200 text-sm font-medium">สต็อกพร้อมขาย</p>
                <p className="text-4xl font-bold leading-tight">{readyCount} <span className="text-lg font-semibold text-indigo-300">คัน</span></p>
                {available.length - readyCount > 0 && (
                  <p className="text-amber-300 text-xs font-medium mt-0.5">+ ติดจอง {available.length - readyCount} คัน</p>
                )}
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

        {/* Search + Sort + Filter */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหา รหัสสินค้า / หมายเลข / ยี่ห้อ / รุ่น..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-slate-800 placeholder:text-slate-400 transition-all shadow-sm" />
          </div>
          {/* จัดเรียง ล่าสุด/เก่าสุด */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <button onClick={() => setSortOrder("newest")}
              className={`flex items-center gap-1 text-sm font-semibold px-3 py-2.5 transition-all ${sortOrder === "newest" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <ChevronDown className="w-3.5 h-3.5" />ล่าสุด
            </button>
            <button onClick={() => setSortOrder("oldest")}
              className={`flex items-center gap-1 text-sm font-semibold px-3 py-2.5 transition-all border-l border-slate-200 ${sortOrder === "oldest" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <ChevronUp className="w-3.5 h-3.5" />เก่าสุด
            </button>
          </div>
          {hasFilter && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 text-slate-500 hover:text-red-600 text-sm px-3 py-2.5 rounded-xl border border-slate-200 hover:border-red-200 hover:bg-red-50 transition-all bg-white shadow-sm">
              <X className="w-3.5 h-3.5" />ล้าง
            </button>
          )}
        </div>

        {/* ── แถบกรองแบบ dropdown (รถพร้อมขายทุกรุ่น) — เลือกได้แบบไล่ระดับ ยี่ห้อ→รุ่น→เสา ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Filter className="w-3.5 h-3.5" />กรอง</span>
          <select value={fBrand} onChange={e => { setFBrand(e.target.value); setFModel(""); setFMast(""); }}
            className="text-sm bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-sm">
            <option value="">ยี่ห้อทั้งหมด</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={fModel} onChange={e => { setFModel(e.target.value); setFMast(""); }}
            className="text-sm bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-sm max-w-[180px]">
            <option value="">รุ่นทั้งหมด</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {masts.length > 0 && (
            <select value={fMast} onChange={e => setFMast(e.target.value)}
              className="text-sm bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-sm">
              <option value="">เสาทั้งหมด</option>
              {masts.map(m => <option key={m} value={m}>เสา {m}</option>)}
            </select>
          )}
          <select value={fFuel} onChange={e => setFFuel(e.target.value)}
            className="text-sm bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer shadow-sm">
            <option value="">พลังงานทั้งหมด</option>
            {fuels.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {/* งาน 4: ค้นเจอรถแต่ถูกซ่อน (ขายแล้ว/เช่า/รอรับ) — แจ้งเหตุผลกันเข้าใจผิดว่าข้อมูลหาย */}
        {searchHiddenHit && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              พบรถ <span className="font-bold">{searchHiddenHit.f.SN || searchHiddenHit.f.id}</span>
              {" "}({searchHiddenHit.f.brand} {searchHiddenHit.f.model}) ในระบบ — <span className="font-bold">แต่ไม่แสดงในรายการขายเพราะ &ldquo;{searchHiddenHit.reason}&rdquo;</span>
              <span className="block text-xs text-amber-600 mt-0.5">สถานะจริงในสต็อก: {String(searchHiddenHit.f.status)} · ถ้าคิดว่าผิด แจ้งฝ่ายสต็อกแก้สถานะ</span>
            </div>
          </div>
        )}

        {/* แถบสลับมุมมอง + จำนวนที่แสดง */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">แสดง <span className="font-bold text-slate-700">{sorted.length}</span> คัน</p>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-sm font-semibold bg-white">
            <button onClick={() => setViewMode("card")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition ${viewMode === "card" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <LayoutGrid className="w-4 h-4" />การ์ด
            </button>
            <button onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition ${viewMode === "table" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <TableIcon className="w-4 h-4" />ตาราง
            </button>
            <button onClick={() => setViewMode("byModel")}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition ${viewMode === "byModel" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              <Package className="w-4 h-4" />ตามรุ่น
            </button>
          </div>
        </div>

        {sorted.length === 0 && (
          <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-100">
            <Filter className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-semibold text-slate-500">ไม่มีสินค้าในระบบ</p>
            <p className="text-sm mt-1">{hasFilter ? "ลองเปลี่ยนตัวกรองการค้นหา" : "ยังไม่มีรถพร้อมขายในสต็อก"}</p>
          </div>
        )}

        {/* ── มุมมองตาราง ── */}
        {viewMode === "table" && sorted.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                  {["รหัส", "ยี่ห้อ/รุ่น", "SN", "PI", "พิกัด", "เสา", "พลังงาน", "สถานะ", "ราคาต้นทุน", "วันรับรถ", "โลเคชั่น", "เซลล์ดูแล", ""].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => (
                  <tr key={item.id} onClick={() => openCheckout(item)}
                    className="border-b border-slate-50 hover:bg-indigo-50/40 cursor-pointer transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isPendingId(item.id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-500 bg-slate-100 border border-slate-200"}`}>#{item.id}</span>
                    </td>
                    <td className="px-3 py-2.5"><span className="font-semibold text-slate-800">{item.brand}</span> <span className="text-slate-500">{item.model}</span></td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.SN || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.pi_no || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{item.capacity || (item.capacity_kg ? `${item.capacity_kg} kg` : "—")}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{mastOf(item) ? <span className="text-indigo-600 font-semibold">{mastOf(item)}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{item.fuel || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{item.status}</span></td>
                    <td className="px-3 py-2.5 font-bold text-indigo-700 whitespace-nowrap">฿{fmt(item.cost_price)}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.received_date || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{item.location || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{(item.custom_fields?.["เซลล์ผู้ดูแล"] as string) || "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold text-xs">ปิดการขาย<ChevronRight className="w-3.5 h-3.5" /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── มุมมองตามรุ่น: เห็นว่ารุ่นไหนเหลือเยอะ/ใกล้หมด → คลิกดูรายคัน ── */}
        {viewMode === "byModel" && sorted.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {byModel.map((g) => {
              const tone = g.ready === 0 ? "bg-slate-100 text-slate-500 border-slate-200"
                : g.ready <= 2 ? "bg-red-50 text-red-700 border-red-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200";
              return (
                <button key={`${g.brand}|${g.model}|${g.mast}`}
                  onClick={() => { setFBrand(g.brand); setFModel(g.model); setFMast(g.mast); setFSpecModel(""); setViewMode("table"); }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-200 p-4 text-left transition-all flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{g.model}{g.mast ? <span className="text-indigo-600"> · เสา {g.mast}</span> : ""}</p>
                      <p className="text-xs text-slate-500">{g.brand}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${tone}`}>
                      {g.ready === 0 ? "หมด" : `เหลือ ${g.ready}`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{[g.capacity, g.fuel].filter(Boolean).join(" · ") || "—"}</p>
                  <p className="text-[11px] text-slate-400 border-t border-slate-50 pt-1.5">พร้อมขาย {g.ready} คัน</p>
                </button>
              );
            })}
          </div>
        )}

        {/* ── มุมมองการ์ด ── */}
        {viewMode === "card" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(item => {
            const recs = inspections.filter(r => r.unit_no === item.SN);
            const photos = recs.flatMap(r => r.images);
            // งาน 3: รูปหน้ารถโชว์บนการ์ด — เลือกช่อง "รถด้านหน้า" ก่อน ถ้าไม่มีใช้รูปแรกที่มี
            const coverPhoto = recs.map(r => r.image_slots?.front).find(Boolean) || photos[0] || null;
            return (
              <div key={item.id}
                onClick={() => openCheckout(item)}
                className="bg-white rounded-2xl shadow-sm hover:shadow-lg border border-slate-100 hover:border-indigo-200 transition-all cursor-pointer group overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-indigo-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                {/* รูปหน้ารถ (ถ้ามี) — ทำให้เซลล์เห็นรถได้ทันที */}
                {coverPhoto ? (
                  <div className="relative h-40 bg-slate-100 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={driveImg(coverPhoto)} alt={`${item.brand} ${item.model}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    {photos.length > 0 && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 text-xs text-white bg-black/55 px-2 py-0.5 rounded-full"><Camera className="w-3 h-3" />{photos.length}</span>
                    )}
                  </div>
                ) : (
                  <div className="h-40 bg-gradient-to-br from-slate-100 to-slate-50 flex flex-col items-center justify-center gap-1.5 border-b border-slate-100">
                    <ImageOff className="w-7 h-7 text-slate-300" />
                    <span className="text-xs text-slate-400">ยังไม่มีรูปรถ</span>
                  </div>
                )}
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      {/* รหัสสินค้า (ID) — โชว์ทุกคันเพื่อแยกรถถูกตัว */}
                      <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md mb-1 ${isPendingId(item.id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-600 bg-slate-100 border border-slate-200"}`}>#{item.id}</span>
                      <p className="font-bold text-slate-800 text-base">{item.brand}</p>
                      <p className="text-sm text-slate-600 font-medium">{item.model}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{item.SN}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_BADGE[item.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{item.status}</span>
                    </div>
                  </div>
                  {(() => {
                    const code = [item.model, item.height, item.control_type, item.fork_length, item.attachments, item.capacity_kg, item.fuel]
                      .map(v => (v == null ? "" : String(v)).trim())
                      .filter(Boolean)
                      .join(" / ");
                    return (
                      <div className="bg-slate-50 rounded-lg px-2.5 py-2 text-xs leading-snug">
                        <span className="text-slate-400">รหัสสเปก</span>
                        <p className="font-semibold text-slate-700 mt-0.5 break-words">{code || "— ไม่มีข้อมูลสเปก —"}</p>
                      </div>
                    );
                  })()}
                  <div className="border-t border-slate-100 pt-3">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2.5"><p className="text-xs text-indigo-500 font-medium">ราคาต้นทุน</p><p className="font-bold text-indigo-700 text-sm">฿{fmt(item.cost_price)}</p></div>
                  </div>
                  <button className="w-full bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600 text-white text-sm font-bold py-2.5 rounded-xl transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 shadow-sm">
                    ปิดการขาย <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </main>

      {/* ── Checkout Modal ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && resetCheckout()}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className={`px-6 py-4 flex items-center justify-between flex-shrink-0 ${editingSale ? "bg-gradient-to-r from-violet-600 to-fuchsia-700" : "bg-gradient-to-r from-indigo-600 to-blue-700"}`}>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">{editingSale ? <><Pencil className="w-4 h-4" />แก้ไขรายการขาย</> : "ปิดการขาย"}</h3>
                <p className={`text-sm ${editingSale ? "text-fuchsia-100" : "text-indigo-200"}`}>{selected.SN} — {selected.brand} {selected.model}</p>
              </div>
              <button onClick={resetCheckout} className="text-white/70 hover:text-white hover:bg-white/20 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-5">
              {submitted ? (
                <div className="flex flex-col items-center justify-center h-52 gap-4">
                  <div className="bg-emerald-100 rounded-full p-4"><CheckCircle className="w-12 h-12 text-emerald-600" /></div>
                  <div className="text-center"><p className="text-xl font-bold text-slate-800">{editingSale ? "แก้ไขสำเร็จ!" : "บันทึกสำเร็จ!"}</p><p className="text-slate-500 text-sm mt-1">บันทึกข้อมูลในระบบแล้ว</p></div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Stock price only */}
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                    <p className="text-xs text-indigo-500 font-medium">ราคาต้นทุน</p>
                    <p className="font-bold text-indigo-700">฿{fmt(selected.cost_price)}</p>
                  </div>

                  {/* ข้อมูลรถจากสต็อก (ดึงอัตโนมัติ ไม่ต้องกรอก) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <p className="text-xs font-semibold text-slate-500 mb-2">ข้อมูลรถ (จากสต็อก)</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {[
                        { label: "PI", value: selected.pi_no },
                        { label: "MODEL", value: selected.model },
                        { label: "พิกัดยก", value: selected.capacity || (selected.capacity_kg ? `${selected.capacity_kg} kg` : "") },
                        { label: "พลังงาน", value: selected.fuel },
                        { label: "เสา (MAST)", value: selected.custom_fields?.["MAST"] },
                        { label: "Valve", value: selected.custom_fields?.["Valve"] ?? selected.control_type },
                        { label: "SN", value: selected.SN },
                        { label: "วันรับรถ", value: selected.received_date },
                      ].map(({ label, value }) => (
                        <div key={label} className="min-w-0">
                          <span className="text-[11px] text-slate-400 block">{label}</span>
                          <span className="text-slate-800 font-medium break-words">{value || "—"}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2.5 pt-2.5 border-t border-slate-200">
                      <span className="text-[11px] text-slate-400 block">รหัสสเปก</span>
                      <span className="text-slate-800 font-medium break-words text-sm">
                        {[selected.model, selected.custom_fields?.["MAST"], selected.height, selected.custom_fields?.["Valve"] ?? selected.control_type, selected.custom_fields?.["ประเภทสินค้า"], selected.capacity, selected.fuel].map(v => (v == null ? "" : String(v)).trim()).filter(Boolean).join(" / ") || "—"}
                      </span>
                    </div>
                  </div>

                  {/* Photos split by role */}
                  {selectedPhotos.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {receiverPhotos.length > 0 && (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                          <p className="text-xs font-semibold text-amber-700 mb-2.5 flex items-center gap-1.5 flex-wrap">
                            🚛 รูปจากผู้รับรถ ({receiverPhotos.length} รูป){receiverNames && <span className="font-bold">— ผู้รับ: {receiverNames}</span>}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {receiverPhotos.map((p, i) => (
                              <button key={i} onClick={e => { e.stopPropagation(); setLightboxIdx(i); }}
                                className="relative aspect-square rounded-xl overflow-hidden bg-amber-100 group hover:ring-2 hover:ring-amber-400 transition-all">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={driveImg(p.url)} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                {p.label && <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate text-center">{p.label}</span>}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center"><ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" /></div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {delivererPhotos.length > 0 && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                          <p className="text-xs font-semibold text-indigo-700 mb-2.5 flex items-center gap-1.5 flex-wrap">
                            📦 รูปจากผู้ส่งมอบรถ ({delivererPhotos.length} รูป){delivererNames && <span className="font-bold">— ผู้ส่ง: {delivererNames}</span>}
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {delivererPhotos.map((p, i) => (
                              <button key={i} onClick={e => { e.stopPropagation(); setLightboxIdx(receiverPhotos.length + i); }}
                                className="relative aspect-square rounded-xl overflow-hidden bg-indigo-100 group hover:ring-2 hover:ring-indigo-400 transition-all">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={driveImg(p.url)} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                {p.label && <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate text-center">{p.label}</span>}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center"><ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" /></div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2 text-slate-400">
                      <ImageOff className="w-4 h-4 flex-shrink-0" /><p className="text-xs">ยังไม่มีรูปตรวจรับสำหรับรถคันนี้</p>
                    </div>
                  )}

                  <form onSubmit={handleSell} className="flex flex-col gap-4">
                    {/* ── ช่องทางติดต่อ + ประเภทขาย ── */}
                    <div className="grid grid-cols-2 gap-3">
                      <SField label="ช่องทางที่ลูกค้าติดต่อ" error="">
                        <select value={form.contact_source} onChange={e => setForm({ ...form, contact_source: e.target.value as ContactSource })} className={ss("")}>
                          <option value="">-- เลือก --</option>
                          {CONTACT_SOURCES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </SField>
                      <SField label="ประเภทการขาย" error="">
                        <select value={form.sale_type} onChange={e => setForm({ ...form, sale_type: e.target.value as SaleType })} className={ss("")}>
                          <option value="">-- เลือก --</option>
                          {fieldConfig.saleTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </SField>
                    </div>

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
                        {fieldConfig.paymentTypes.map(p => <option key={p} value={p}>{p}</option>)}
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

                    {/* ── การแจ้งเตือน (Part 4) ── */}
                    <div className="border border-amber-100 rounded-xl p-3.5 bg-amber-50/40">
                      <div className="flex items-center justify-between mb-2.5">
                        <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" />ตั้งการแจ้งเตือน (ไม่บังคับ)</p>
                        <button type="button" onClick={() => setShowCustomNotifs(p => !p)}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${showCustomNotifs ? "bg-amber-500 text-white border-amber-500" : "text-amber-600 border-amber-200 hover:bg-amber-100"}`}>
                          <Pencil className="w-3 h-3" />เพิ่มเอง{customNotifItems.length > 0 && ` (${customNotifItems.length})`}
                        </button>
                      </div>

                      {/* Fixed date fields with clear buttons */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">วันหมดประกันรถ</label>
                          <div className="flex items-center gap-1">
                            <input type="date" value={form.warranty_expiry} onChange={e => setForm({ ...form, warranty_expiry: e.target.value })} className={`flex-1 ${si("")}`} />
                            {form.warranty_expiry && (
                              <button type="button" onClick={() => setForm({ ...form, warranty_expiry: "" })}
                                className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">รอบเปลี่ยนอะไหล่</label>
                          <div className="flex items-center gap-1">
                            <input type="date" value={form.parts_schedule} onChange={e => setForm({ ...form, parts_schedule: e.target.value })} className={`flex-1 ${si("")}`} />
                            {form.parts_schedule && (
                              <button type="button" onClick={() => setForm({ ...form, parts_schedule: "" })}
                                className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-all flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Custom items — always visible once added */}
                      {customNotifItems.length > 0 && (
                        <div className="mt-3 border-t border-amber-100 pt-3 flex flex-col gap-1.5">
                          {customNotifItems.map((item, i) => (
                            <div key={i} className="flex items-center gap-2 bg-white border border-amber-100 rounded-lg px-2.5 py-1.5 text-xs">
                              <Bell className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              <span className="flex-1 font-medium text-slate-700">{item.label}</span>
                              <span className="text-slate-400 text-xs">{item.date}</span>
                              <button type="button" onClick={() => setCustomNotifItems(p => p.filter((_, j) => j !== i))}
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-all flex-shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add-form — toggled by pencil button */}
                      {showCustomNotifs && (
                        <div className="mt-3 border-t border-amber-100 pt-3">
                          <p className="text-xs font-semibold text-amber-700 mb-2">เพิ่มการแจ้งเตือนแบบกำหนดเอง</p>
                          <div className="flex gap-2">
                            <input value={newNotifLabel} onChange={e => setNewNotifLabel(e.target.value)}
                              placeholder="ชื่อการแจ้งเตือน เช่น ต่อภาษี..."
                              className="flex-1 border border-dashed border-amber-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-slate-400 bg-white text-slate-800" />
                            <input type="date" value={newNotifDate} onChange={e => setNewNotifDate(e.target.value)}
                              className="border border-dashed border-amber-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-slate-800" />
                            <button type="button"
                              onClick={() => {
                                if (!newNotifLabel.trim() || !newNotifDate) return;
                                setCustomNotifItems(p => [...p, { label: newNotifLabel.trim(), date: newNotifDate }]);
                                setNewNotifLabel(""); setNewNotifDate("");
                              }}
                              disabled={!newNotifLabel.trim() || !newNotifDate}
                              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors flex-shrink-0">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <SField label="หมายเหตุ" error="">
                      <textarea value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} rows={2} placeholder="หมายเหตุเพิ่มเติม..."
                        className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-400 resize-none transition-all" />
                    </SField>

                    {/* หลักฐานการชำระเงิน — บังคับแนบรูป */}
                    <SField label="หลักฐานการชำระเงิน *" error={errors.payment_proof}>
                      <input ref={paymentInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePaymentProof} />
                      {paymentProof ? (
                        <div className="relative rounded-xl overflow-hidden border-2 border-emerald-300 bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={driveImg(paymentProof)} alt="หลักฐานการชำระเงิน" className="w-full max-h-56 object-contain bg-slate-50" />
                          <div className="absolute top-2 right-2 flex gap-1.5">
                            <button type="button" onClick={() => paymentInputRef.current?.click()} className="bg-slate-900/70 hover:bg-slate-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Camera className="w-3.5 h-3.5" />เปลี่ยน</button>
                            <button type="button" onClick={() => setPaymentProof("")} className="bg-slate-900/70 hover:bg-red-500 text-white rounded-lg p-1.5"><X className="w-3.5 h-3.5" /></button>
                          </div>
                          <span className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[11px] font-bold px-2 py-1 text-center">✓ แนบหลักฐานแล้ว</span>
                        </div>
                      ) : (
                        <button type="button" onClick={() => paymentInputRef.current?.click()}
                          className={`w-full border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-1.5 transition-all ${errors.payment_proof ? "border-red-300 bg-red-50/40 hover:bg-red-50" : "border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50"}`}>
                          <Camera className={`w-6 h-6 ${errors.payment_proof ? "text-red-400" : "text-emerald-500"}`} />
                          <span className={`text-sm font-semibold ${errors.payment_proof ? "text-red-600" : "text-emerald-700"}`}>แตะเพื่อถ่าย/แนบสลิปการชำระเงิน</span>
                          <span className="text-[11px] text-slate-400">จำเป็นต้องแนบ — ห้ามข้าม</span>
                        </button>
                      )}
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

                    {/* ── คำนวณกำไร (ราคาขาย − ต้นทุน − ของแถม − ค่าขนส่ง) ── */}
                    {selected && (() => {
                      const isQ22K2 = /Q22K2/i.test(selected.model) && (String(selected.fuel || "").includes("ดีเซล") || /^CPCD/i.test(selected.model));
                      const sale = Number(form.actual_sale) || 0;
                      const cost = selected.cost_price || 0;
                      const ship = Number(shippingCost) || 0;
                      const free = freebie ? 2800 : 0;
                      const profit = sale - cost - free - ship;
                      return (
                        <div className="border border-emerald-100 bg-emerald-50/40 rounded-xl p-3 flex flex-col gap-2">
                          <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5"><Target className="w-3.5 h-3.5" />คำนวณกำไร</p>
                          {isQ22K2 && (
                            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                              <input type="checkbox" checked={freebie} onChange={e => setFreebie(e.target.checked)} className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <span>มีของแถม (กรองเครื่อง/เกียร์/อากาศ + น้ำมันเครื่อง/เกียร์) — หักต้นทุน ฿2,800</span>
                            </label>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600 flex-shrink-0">ค่าขนส่ง (จากซัพพลายเออร์)</span>
                            <input type="number" value={shippingCost} onChange={e => setShippingCost(e.target.value)} placeholder="0"
                              className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                          </div>
                          <div className="border-t border-emerald-100 pt-2 text-sm flex flex-col gap-0.5">
                            <div className="flex justify-between text-slate-500"><span>ราคาขาย</span><span>฿{sale.toLocaleString()}</span></div>
                            <div className="flex justify-between text-slate-500"><span>− ต้นทุนสินค้า</span><span>฿{cost.toLocaleString()}</span></div>
                            {free > 0 && <div className="flex justify-between text-slate-500"><span>− ของแถม</span><span>฿{free.toLocaleString()}</span></div>}
                            {ship > 0 && <div className="flex justify-between text-slate-500"><span>− ค่าขนส่ง</span><span>฿{ship.toLocaleString()}</span></div>}
                            <div className={`flex justify-between font-bold pt-1 ${profit >= 0 ? "text-emerald-700" : "text-red-600"}`}><span>= กำไร</span><span>฿{profit.toLocaleString()}</span></div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── อุปกรณ์เสริม (Add-On) — ติดตั้งพร้อมรถ · ราคาเติมเอง ── */}
                    <div className="border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                      <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />อุปกรณ์เสริม (ถ้ามี)</p>
                      {addOns.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-2.5 py-1.5">
                          <span className="flex-1 text-slate-700">{a.name}</span>
                          <span className="text-indigo-600 font-bold">฿{a.price.toLocaleString()}</span>
                          <button type="button" onClick={() => setAddOns(addOns.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <select value={newAddon.name} onChange={e => setNewAddon({ ...newAddon, name: e.target.value })}
                          className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">
                          <option value="">เลือกอุปกรณ์...</option>
                          {ADDON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <input type="number" value={newAddon.price} onChange={e => setNewAddon({ ...newAddon, price: e.target.value })}
                          placeholder="ราคา" className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                        <button type="button" onClick={() => { if (newAddon.name && newAddon.price) { setAddOns([...addOns, { name: newAddon.name, price: Number(newAddon.price) }]); setNewAddon({ name: "", price: "" }); } }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 text-sm font-bold flex-shrink-0">เพิ่ม</button>
                      </div>
                    </div>

                    {/* ── Action buttons (Part 3) ── */}
                    <div className="flex flex-col gap-2 pt-2">
                      {editingSale && (
                        <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
                          <Pencil className="w-3.5 h-3.5 flex-shrink-0" />กำลังแก้ไขดีลเดิม — เลือกสถานะที่ต้องการบันทึกทับ (เปลี่ยนสถานะได้)
                        </p>
                      )}
                      <button type="submit" className={`w-full text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 ${editingSale ? "bg-gradient-to-r from-violet-600 to-fuchsia-700 hover:from-violet-500 hover:to-fuchsia-600" : "bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600"}`}>
                        <CheckCircle className="w-4 h-4" />{editingSale ? "บันทึกการแก้ไข" : "ปิดการขาย / จัดส่งแล้ว"}
                      </button>
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={handleBook}
                          className="w-full bg-amber-400 hover:bg-amber-500 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-1 text-xs">
                          📌 มัดจำแล้ว
                        </button>
                        <button type="button" onClick={handleShipping}
                          className="w-full bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-1 text-xs">
                          🚚 รอจัดส่ง
                        </button>
                        <button type="button" onClick={handleFinance}
                          className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-1 text-xs">
                          🏦 รอไฟแนนซ์
                        </button>
                      </div>
                    </div>
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
            <img src={driveImg(selectedPhotos[lightboxIdx].url)} alt={selectedPhotos[lightboxIdx].label} className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
          </div>
          {lightboxIdx < selectedPhotos.length - 1 && <button onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3"><ChevronRight className="w-6 h-6" /></button>}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {selectedPhotos[lightboxIdx].label && <span className="font-semibold text-white">{selectedPhotos[lightboxIdx].label} · </span>}
            {lightboxIdx + 1} / {selectedPhotos.length}
          </p>
        </div>
      )}

      {/* ── Sale Detail Modal (Part 2) ── */}
      {detailSale && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[55] flex items-end sm:items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) { setDetailSale(null); setDetailLightboxIdx(null); } }}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-indigo-50">
              <div>
                <h3 className="text-base font-bold text-slate-800">รายละเอียดการขาย</h3>
                <p className="text-xs text-slate-500">{detailSale.forklift_unit_no} — {detailSale.forklift_brand} {detailSale.forklift_model}</p>
              </div>
              <button onClick={() => { setDetailSale(null); setDetailLightboxIdx(null); }} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-3">
              {/* Status badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${SALE_STATUS_BADGE[detailSale.sale_status ?? "ขายแล้ว"]}`}>
                  {detailSale.sale_status ?? "ขายแล้ว"}
                </span>
                {detailSale.vehicle_type && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">{detailSale.vehicle_type}</span>
                )}
                {detailSale.contact_source && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CONTACT_SOURCE_COLORS[detailSale.contact_source] ?? "bg-slate-100 text-slate-600"}`}>{detailSale.contact_source}</span>
                )}
                {detailSale.sale_type && (
                  <span className="text-xs bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full font-semibold">{detailSale.sale_type}</span>
                )}
              </div>

              {/* ── ยกเลิกการจอง — เฉพาะดีลที่ยังไม่ปิดขาด (ไม่ผ่านไฟแนนซ์/ลูกค้ายกเลิก) ── */}
              {!["ปิดการขาย/จัดส่งแล้ว", "ขายแล้ว"].includes(detailSale.sale_status ?? "") && (
                <div className="border border-rose-100 bg-rose-50/50 rounded-xl p-3">
                  {!cancelBox ? (
                    <button onClick={() => setCancelBox(true)} className="text-sm font-semibold text-rose-600 flex items-center gap-1.5 hover:text-rose-700">
                      <RotateCcw className="w-4 h-4" />ยกเลิกการจอง — คืนรถสู่สต็อก
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-bold text-rose-700">เหตุผลการยกเลิก</p>
                      <select value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                        className="w-full border border-rose-200 rounded-lg px-2.5 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-300">
                        <option value="">— เลือกเหตุผล —</option>
                        <option value="ไม่ผ่านไฟแนนซ์">ไม่ผ่านไฟแนนซ์</option>
                        <option value="ลูกค้ายกเลิกการสั่งซื้อ">ลูกค้ายกเลิกการสั่งซื้อ</option>
                        <option value="รถมีปัญหา/เปลี่ยนคัน">รถมีปัญหา / เปลี่ยนคัน</option>
                        <option value="อื่นๆ">อื่นๆ</option>
                      </select>
                      <div className="flex gap-2">
                        <button onClick={cancelBooking} disabled={!cancelReason}
                          className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-sm font-bold py-2 rounded-lg transition-colors">ยืนยันยกเลิก</button>
                        <button onClick={() => { setCancelBox(false); setCancelReason(""); }}
                          className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold py-2 rounded-lg transition-colors">ปิด</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <DetailRow label="รถ" value={`${detailSale.forklift_brand} ${detailSale.forklift_model} (${detailSale.forklift_unit_no})`} />
              <DetailRow label="พนักงานขาย" value={detailSale.sales_staff} />
              <DetailRow label="ชื่อลูกค้า" value={detailSale.customer_name} />
              <DetailRow label="เบอร์โทร" value={detailSale.customer_tel} />
              <DetailRow label="ประเภทลูกค้า" value={detailSale.customer_type} />
              <DetailRow label="จังหวัด" value={detailSale.province} />
              <DetailRow label="การชำระ" value={detailSale.payment_type + (detailSale.finance_company ? ` — ${detailSale.finance_company}` : "")} />
              <DetailRow label="ราคาขาย" value={`฿${detailSale.actual_sale.toLocaleString("th-TH")}`} highlight />
              <DetailRow label="มัดจำ" value={`฿${detailSale.deposit.toLocaleString("th-TH")}`} />
              <DetailRow label="วันส่งมอบ" value={detailSale.delivery_date} />
              <DetailRow label="วันที่บันทึก" value={detailSale.created_at} />
              {detailSale.warranty_expiry && (
                <DetailRow label="วันหมดประกัน"
                  value={`${detailSale.warranty_expiry}${(() => { const d = daysUntil(detailSale.warranty_expiry!); return d < 0 ? ` (เกินกำหนด ${Math.abs(d)} วัน)` : d === 0 ? " (วันนี้!)" : ` (เหลืออีก ${d} วัน)`; })()}`} />
              )}
              {detailSale.parts_schedule && (
                <DetailRow label="รอบเปลี่ยนอะไหล่"
                  value={`${detailSale.parts_schedule}${(() => { const d = daysUntil(detailSale.parts_schedule!); return d < 0 ? ` (เกินกำหนด ${Math.abs(d)} วัน)` : d === 0 ? " (วันนี้!)" : ` (เหลืออีก ${d} วัน)`; })()}`} />
              )}
              {(detailSale.custom_notifications ?? []).length > 0 && (
                <div className="border-t border-amber-100 pt-3 mt-1">
                  <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5"><Bell className="w-3 h-3" />การแจ้งเตือนแบบกำหนดเอง</p>
                  {(detailSale.custom_notifications ?? []).map((n, i) => {
                    const d = daysUntil(n.date);
                    const suffix = d < 0 ? ` (เกินกำหนด ${Math.abs(d)} วัน)` : d === 0 ? " (วันนี้!)" : ` (เหลืออีก ${d} วัน)`;
                    return <DetailRow key={i} label={n.label} value={`${n.date}${suffix}`} />;
                  })}
                </div>
              )}
              {detailSale.remark && <DetailRow label="หมายเหตุ" value={detailSale.remark} />}
              {detailSale.payment_proof && (
                <div className="border-t border-slate-100 pt-3 mt-1">
                  <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" />หลักฐานการชำระเงิน</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={driveImg(detailSale.payment_proof)} alt="หลักฐานการชำระเงิน" className="w-full max-h-72 object-contain rounded-xl border border-slate-200 bg-slate-50" />
                </div>
              )}
              {detailSale.custom_fields && Object.keys(detailSale.custom_fields).length > 0 && (
                <div className="border-t border-slate-100 pt-3 mt-1">
                  <p className="text-xs font-semibold text-violet-700 mb-2">รายการเพิ่มเติม</p>
                  {Object.entries(detailSale.custom_fields).map(([k, v]) => (
                    <DetailRow key={k} label={k} value={v} />
                  ))}
                </div>
              )}
              {detailInspPhotos.all.length > 0 && (
                <div className="border-t border-slate-100 pt-3 mt-1">
                  <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />รูปภาพประกอบ
                  </p>
                  {detailInspPhotos.receiver.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-amber-700 mb-2">🚛 รูปผู้รับรถ ({detailInspPhotos.receiver.length} รูป){detailInspPhotos.receiverNames && ` — ผู้รับ: ${detailInspPhotos.receiverNames}`}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {detailInspPhotos.receiver.map((p, i) => (
                          <button key={i} onClick={() => setDetailLightboxIdx(i)}
                            className="relative aspect-square rounded-xl overflow-hidden bg-amber-50 group hover:ring-2 hover:ring-amber-400 transition-all">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={driveImg(p.url)} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            {p.label && <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate text-center">{p.label}</span>}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {detailInspPhotos.deliverer.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-indigo-700 mb-2">📦 รูปผู้ส่งมอบรถ ({detailInspPhotos.deliverer.length} รูป){detailInspPhotos.delivererNames && ` — ผู้ส่ง: ${detailInspPhotos.delivererNames}`}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {detailInspPhotos.deliverer.map((p, i) => (
                          <button key={i} onClick={() => setDetailLightboxIdx(detailInspPhotos.receiver.length + i)}
                            className="relative aspect-square rounded-xl overflow-hidden bg-indigo-50 group hover:ring-2 hover:ring-indigo-400 transition-all">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={driveImg(p.url)} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            {p.label && <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] font-semibold px-1.5 py-0.5 truncate text-center">{p.label}</span>}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Photo Lightbox ── */}
      {detailSale && detailLightboxIdx !== null && detailInspPhotos.all.length > 0 && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex items-center justify-center p-4" onClick={() => setDetailLightboxIdx(null)}>
          <button onClick={() => setDetailLightboxIdx(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 rounded-full p-2"><X className="w-6 h-6" /></button>
          {detailLightboxIdx > 0 && (
            <button onClick={e => { e.stopPropagation(); setDetailLightboxIdx(detailLightboxIdx - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3"><ChevronLeft className="w-6 h-6" /></button>
          )}
          <div className="max-w-3xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={driveImg(detailInspPhotos.all[detailLightboxIdx].url)} alt={detailInspPhotos.all[detailLightboxIdx].label} className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
          </div>
          {detailLightboxIdx < detailInspPhotos.all.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setDetailLightboxIdx(detailLightboxIdx + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3"><ChevronRight className="w-6 h-6" /></button>
          )}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {detailInspPhotos.all[detailLightboxIdx].label && <span className="font-semibold text-white">{detailInspPhotos.all[detailLightboxIdx].label} · </span>}
            {detailLightboxIdx + 1} / {detailInspPhotos.all.length}
          </p>
        </div>
      )}

      {/* ── Sales History Modal (Part 2) ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[82vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <div><h3 className="text-base font-bold text-slate-800">การขายของฉัน</h3><p className="text-xs text-slate-500 mt-0.5">{mySales.length} ดีล · {myCustomers.length} ลูกค้า</p></div>
              <button onClick={() => { setShowHistory(false); setDeleteConfirm(null); }} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
            </div>

            {/* สลับ: ดีลของฉัน / ลูกค้าของฉัน */}
            <div className="flex gap-2 px-4 pt-3 flex-shrink-0">
              <button onClick={() => setHistoryView("deals")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition ${historyView === "deals" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>📋 ดีลของฉัน ({mySales.length})</button>
              <button onClick={() => setHistoryView("customers")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition ${historyView === "customers" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>👥 ลูกค้าของฉัน ({myCustomers.length})</button>
            </div>

            {/* Category Tabs (เฉพาะมุมมองดีล) */}
            {historyView === "deals" && (
            <div className="flex gap-1 px-4 pt-3 pb-2 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
              {HISTORY_TABS.map(tab => {
                const count = tab.key === "all" ? mySales.length : mySales.filter(s => (s.sale_status ?? "ขายแล้ว") === tab.key).length;
                return (
                  <button key={tab.key} onClick={() => setHistoryTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${historyTab === tab.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {tab.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${historyTab === tab.key ? "bg-white/30 text-white" : "bg-white text-slate-500"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            )}

            {/* มุมมองดีลของฉัน */}
            {historyView === "deals" && (filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400"><History className="w-10 h-10 text-slate-300 mb-2" /><p className="text-sm">ยังไม่มีประวัติการขาย</p></div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
                {filteredHistory.map(sale => (
                  <div key={sale.id} className="bg-slate-50 border border-slate-100 rounded-xl p-4 group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {sale.forklift_id && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isPendingId(sale.forklift_id) ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-slate-600 bg-slate-100 border border-slate-200"}`}>#{sale.forklift_id}</span>
                          )}
                          <p className="font-bold text-slate-800 text-sm">{sale.forklift_unit_no}</p>
                          <p className="text-slate-600 text-sm">{sale.forklift_brand} {sale.forklift_model}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${SALE_STATUS_BADGE[sale.sale_status ?? "ขายแล้ว"]}`}>
                            {sale.sale_status ?? "ขายแล้ว"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 truncate">{sale.customer_name} · {sale.province}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sale.payment_type === "เงินสด" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{sale.payment_type}</span>
                          {sale.contact_source && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONTACT_SOURCE_COLORS[sale.contact_source] ?? "bg-slate-100 text-slate-600"}`}>{sale.contact_source}</span>}
                          <span className="text-xs text-slate-500">{sale.created_at}</span>
                        </div>
                        {/* ── Notification countdown tags ── */}
                        {(() => {
                          const tags: { label: string; days: number }[] = [];
                          if (sale.warranty_expiry) tags.push({ label: "ประกันรถ", days: daysUntil(sale.warranty_expiry) });
                          if (sale.parts_schedule)  tags.push({ label: "เปลี่ยนอะไหล่", days: daysUntil(sale.parts_schedule) });
                          (sale.custom_notifications ?? []).forEach(n => tags.push({ label: n.label, days: daysUntil(n.date) }));
                          if (tags.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {tags.map((tag, ti) => {
                                const expired  = tag.days < 0;
                                const urgent   = tag.days >= 0 && tag.days <= 7;
                                const upcoming = tag.days > 7 && tag.days <= 30;
                                const future   = tag.days > 30;
                                const cls = expired  ? "bg-red-100 text-red-700 border-red-200"
                                          : urgent   ? "bg-amber-100 text-amber-700 border-amber-200"
                                          : upcoming ? "bg-blue-100 text-blue-700 border-blue-200"
                                          : "bg-slate-100 text-slate-600 border-slate-200";
                                const label = expired
                                  ? `${tag.label} — เกินกำหนด ${Math.abs(tag.days)} วัน`
                                  : tag.days === 0
                                    ? `${tag.label} — วันนี้!`
                                    : future
                                      ? `${tag.label} — อีก ${tag.days} วัน`
                                      : `${tag.label} — เหลืออีก ${tag.days} วัน`;
                                return (
                                  <span key={ti} className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
                                    <Bell className="w-2.5 h-2.5 flex-shrink-0" />{label}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                        <p className="font-bold text-indigo-700">฿{sale.actual_sale.toLocaleString("th-TH")}</p>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDetailSale(sale)}
                            className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 p-1.5 rounded-lg transition-all flex items-center gap-1 text-xs font-medium">
                            <Eye className="w-3.5 h-3.5" />ดู
                          </button>
                          <button onClick={() => { setShowHistory(false); openEditSale(sale); }}
                            className="text-violet-600 hover:text-violet-800 hover:bg-violet-50 p-1.5 rounded-lg transition-all flex items-center gap-1 text-xs font-semibold">
                            <Pencil className="w-3.5 h-3.5" />แก้ไข
                          </button>
                        </div>
                        {deleteConfirm === sale.id ? (
                          <div className="flex gap-1.5 mt-1 justify-end">
                            <button onClick={() => handleDeleteSale(sale.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Trash2 className="w-3 h-3" />ลบ</button>
                            <button onClick={() => setDeleteConfirm(null)} className="bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-1.5 rounded-lg">ยกเลิก</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(sale.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* มุมมองลูกค้าของฉัน */}
            {historyView === "customers" && (myCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Users className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">ยังไม่มีข้อมูลลูกค้า</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2.5">
                {myCustomers.map((c, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {c.tel ? `☎ ${c.tel}` : "ไม่มีเบอร์"}{c.province ? ` · ${c.province}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                        {c.deals.length} ดีล
                      </span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {c.deals.map((d, j) => (
                        <button key={j} onClick={() => { setShowHistory(false); setDetailSale(d); }}
                          className="text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                          {d.forklift_brand} {d.forklift_model} · {d.sale_status ?? "ขายแล้ว"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Settings Modal (Sales) ── */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="w-full max-w-2xl shadow-2xl"
            style={{ height: "88vh", overflowY: "scroll", borderRadius: "24px", backgroundColor: "white" }}>

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

            <div className="p-5 flex flex-col gap-4">
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

              {/* Sale extra field defs */}
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
                  {fieldConfig.salesFilterRequests.length === 0 && !showAddFilter && <p className="text-xs text-slate-400 text-center py-2">ยังไม่มีตัวกรองที่ขอเพิ่ม</p>}
                  {fieldConfig.salesFilterRequests.map(name => (
                    <div key={name} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm text-slate-700">{name}</span>
                      <button onClick={() => removeSalesFilterRequest(name)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {/* เพิ่มตัวกรองใหม่ */}
                  {showAddFilter ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus value={newFilterName} onChange={e => setNewFilterName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") confirmAddFilter(); if (e.key === "Escape") { setShowAddFilter(false); setNewFilterName(""); } }}
                        placeholder="ชื่อตัวกรอง เช่น ความยาวงา"
                        className="flex-1 border border-indigo-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <button onClick={confirmAddFilter} disabled={!newFilterName.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg disabled:opacity-40 transition-colors"><Check className="w-4 h-4" /></button>
                      <button onClick={() => { setShowAddFilter(false); setNewFilterName(""); }}
                        className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-lg transition-all"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddFilter(true)}
                      className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-400 text-indigo-600 hover:bg-indigo-50 rounded-lg py-2.5 flex items-center justify-center gap-1.5 text-sm font-semibold transition-all">
                      <Plus className="w-4 h-4" />เพิ่มตัวกรอง
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ผู้ช่วย AI พี่เก่ง (โครงไว้ก่อน — เติมความสามารถทีหลัง) ── */}
      <AiAssistant salesUserName={salesUser?.name} />
    </div>
  );
}

// แถวปุ่มกรองสเปก — ชุดค่าเดียวกับที่ฝ่ายสต๊อกกรอก กดเลือก/กดซ้ำยกเลิก
function FilterChipRow({ label, options, value, onChange, fmt }: {
  label: string; options: string[]; value: string;
  onChange: (v: string) => void; fmt?: (v: string) => string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {options.map(opt => (
          <button key={opt} type="button"
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${value === opt
              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
              : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700"}`}>
            {fmt ? fmt(opt) : opt}
          </button>
        ))}
      </div>
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
function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 font-medium w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm flex-1 ${highlight ? "font-bold text-indigo-700" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}
function si(error: string) {
  return `w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${error ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300 bg-white"}`;
}
function ss(error: string) {
  return `w-full border rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all ${error ? "border-red-300" : "border-slate-200 hover:border-slate-300"}`;
}
