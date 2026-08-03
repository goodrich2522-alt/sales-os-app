"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Package, Plus, LogOut, CheckCircle, AlertCircle, List, X,
  TrendingUp, Boxes, Trash2, Settings, Pencil, Check, ChevronDown, ChevronRight,
  Clock, Hash, Camera, ImageOff, Eye, Bell, MapPin, History,
  Download, Upload, FileText, ShoppingCart, User
} from "lucide-react";
import { Forklift, Sale, STOCK_APPROVAL_FIELD, isVoidSale } from "@/lib/types";
import { COMMISSION_FIELD, COMMISSION_CATEGORIES } from "@/lib/commission";
import { useApp, FieldConfig } from "@/lib/AppContext";
import { isPendingId } from "@/lib/productId";
import { thaiMonthShort } from "@/lib/format";
import { Lightbox } from "@/components/ui/Lightbox";
import { Chip } from "@/components/ui/Chip";
import { StatusBadge } from "@/components/ui/Badge";
import { VEHICLE_CATS, CatFilter, SALE_STATUS_BADGE, saleStatusGroup, SALE_STATUS_FILTER_GROUPS, SALE_STATUS_OPTIONS } from "@/lib/constants";
import { QuoteImport } from "@/components/QuoteImport";
import { parseForkliftCsv, assignIdsAndStamp, buildCsvTemplate } from "@/lib/forkliftCsv";
import { hasActiveSession, signOutSupabase } from "@/lib/auth";
import { apiEnabled } from "@/lib/api";
import { driveImg } from "@/lib/img";


// ฟิลด์ dropdown ฝั่งสต็อก — ไม่รวมประเภทการขาย/การชำระ (จัดการในหน้าฝ่ายขาย)
type DropdownField = keyof Omit<FieldConfig, "customFieldDefs" | "saleExtraFieldDefs" | "salesFilterRequests" | "saleTypes" | "paymentTypes" | "knownUsers" | "adminEmails" | "commissionLocks">;

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

// ยอดเงินย่อ — หลักล้านโชว์ "ล." (ใช้ในกราฟสรุปรายเซลล์)
const fmtM = (n: number) => Math.abs(n) >= 1_000_000 ? (n / 1_000_000).toFixed(1) + " ล." : (Number(n) || 0).toLocaleString("th-TH");

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
    forklifts, addForkliftsBulk, updateForklift, deleteForklift, inspections, sales, updateSale,
    approveStockSale, rejectStockSale, setActor,
    exportData, importData,
    fieldConfig, updateFieldOptions,
    removeCustomFieldDef, renameCustomFieldDef,
    addCustomFieldOption, removeCustomFieldOption, editCustomFieldOption,
  } = useApp();

  const [username, setUsername]     = useState("");
  const [stockEmail, setStockEmail] = useState("");      // อีเมลผู้ล็อกอิน (ใช้เช็คสิทธิ์แก้ข้อมูลการเงิน)
  const [showImport, setShowImport] = useState(false);   // นำเข้าจากใบเสนอราคา (เฟส 4)
  const [listSearch, setListSearch] = useState("");
  const [listCat, setListCat]       = useState<CatFilter>("all");
  const [listStatus, setListStatus] = useState("all");
  const [listBrand, setListBrand]   = useState("all");                                       // กรองยี่ห้อ
  const [listModel, setListModel]   = useState("all");                                       // กรองรุ่น
  const [listMast, setListMast]     = useState("all");                                       // กรองเสา (MAST)
  const [listFuel, setListFuel]     = useState("all");                                       // กรองพลังงาน
  const [listSort, setListSort]     = useState<"recent" | "model" | "remain" | "sn" | "pi">("recent"); // การเรียง
  const [listView, setListView]     = useState<"list" | "table" | "byModel" | "aging">("list");  // มุมมอง: รายคัน / ตาราง / รวมตามรุ่น / ค้างนาน
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showSettings, setShowSettings]   = useState(false);
  const [detailItem, setDetailItem]       = useState<Forklift | null>(null); // รถที่กดดูรายละเอียด
  const [detailLightbox, setDetailLightbox] = useState<{ imgs: string[]; idx: number } | null>(null);
  const [locEdit, setLocEdit]             = useState(""); // แก้สถานที่ที่รถอยู่ (ใน detail modal)
  const [locSaved, setLocSaved]           = useState(false);
  const [noteEdit, setNoteEdit]           = useState(""); // หมายเหตุ/รายละเอียดการขาย (custom_fields["หมายเหตุการขาย"])
  const [noteSaved, setNoteSaved]         = useState(false);
  const [orderDateEdit, setOrderDateEdit] = useState(""); // วันสั่งรถ (รถสั่งผลิต)
  const [orderSaved, setOrderSaved]       = useState(false);
  // แก้ไขข้อมูลการเงิน (เฉพาะวรลักษณ์) — ต้นทุน/ราคาขายจริง/ค่าขนส่ง/ทุนอุปกรณ์ · แก้ได้ทุกสถานะ
  const [finEdit, setFinEdit]             = useState({ cost: "", sale: "", ship: "", addon: "", profit: "" });
  const [finSaved, setFinSaved]           = useState(false);
  // ── ประวัติการขาย (เฟส 1): ดีลทุกเซลล์ ──
  const [showSaleHistory, setShowSaleHistory] = useState(false);
  const [showReorder, setShowReorder]     = useState(false); // กางรายการเตรียมสั่งสินค้า (คลิกจากการ์ด)
  const [histStaff, setHistStaff]         = useState("all"); // กรองรายเซลล์
  const [histStatus, setHistStatus]       = useState("all");
  const [histSearch, setHistSearch]       = useState("");
  const [histView, setHistView]           = useState<"deals" | "summary">("deals"); // รายดีล / สรุปรายเซลล์
  const [histDetail, setHistDetail]       = useState<Sale | null>(null); // ดีลที่กางดูรายละเอียด
  const [histEdit, setHistEdit]           = useState<{ sale_status: string; delivery_date: string; remark: string; eta: string; sn: string; commCat: string } | null>(null); // eta=วันคาดรับ · sn=SN จริงรถสั่งผลิต · commCat=หมวดค่าคอม

  // ── แจ้งเตือนเซลล์ทำรายการขาย — คงค้างจนแอดมินอ่าน + กดยืนยันตัดออกจากสต็อก (เก็บ ack ใน localStorage) ──
  type SaleAlert = { id: string; staff: string; status: string; title: string; sub: string };
  const ACK_KEY = "stock_sale_acks";
  const [ackedIds, setAckedIds]   = useState<Set<string>>(new Set());
  const [ackReady, setAckReady]   = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [confirmAllImport, setConfirmAllImport] = useState(false); // ยืนยันนำเข้าทั้งหมด (2 จังหวะกันพลาด)

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
    const parsed = JSON.parse(u); const nm = parsed.name; setUsername(nm); setStockEmail(String(parsed.email || "").toLowerCase()); setActor(`${nm} (สต็อก)`);
    // มีข้อมูลค้างแต่ session Supabase หมดอายุ/ไม่มี → บังคับล็อกอินใหม่ (กันเซฟไม่เข้าแบบเงียบๆ)
    (async () => {
      if (apiEnabled && !(await hasActiveSession())) {
        localStorage.removeItem("stock_user");
        router.push("/stock/login");
      }
    })();
  }, [router]);

  // เปิดรถคันไหน → เติมสถานที่เดิมลงช่องแก้ไข
  useEffect(() => {
    setLocEdit(detailItem?.location ?? ""); setLocSaved(false);
    setNoteEdit((detailItem?.custom_fields?.["หมายเหตุการขาย"] as string) ?? ""); setNoteSaved(false);
    setOrderDateEdit((detailItem?.custom_fields?.["วันสั่งรถ"] as string) ?? ""); setOrderSaved(false);
    const cf = (detailItem?.custom_fields ?? {}) as Record<string, unknown>;
    setFinEdit({
      cost: detailItem?.cost_price ? String(detailItem.cost_price) : "",
      sale: cf["ราคาขายจริง"] != null ? String(cf["ราคาขายจริง"]) : "",
      ship: cf["ค่าขนส่งจริง"] != null ? String(cf["ค่าขนส่งจริง"]) : "",
      addon: cf["ทุนอุปกรณ์เสริม"] != null ? String(cf["ทุนอุปกรณ์เสริม"]) : "",
      profit: cf["กำไร(ไฟล์)"] != null ? String(cf["กำไร(ไฟล์)"]) : "",
    });
    setFinSaved(false);
  }, [detailItem]);

  // สิทธิ์แก้ไขข้อมูลการเงิน (ต้นทุน/ค่าขนส่ง ฯลฯ) — เฉพาะวรลักษณ์เท่านั้น (ชื่อ หรือ อีเมลแอดมิน)
  const canEditFinance = /วรลักษณ์/.test(username) || ["goodrichforklift@gmail.com"].includes(stockEmail);

  // โหลดรายการที่ "รับทราบแล้ว" · ครั้งแรกที่เปิด (ยังไม่มี key) ถือว่าดีลเก่าทั้งหมดรับทราบแล้ว กันสแปมของเก่า
  useEffect(() => {
    if (ackReady) return;
    const raw = localStorage.getItem(ACK_KEY);
    if (raw) { setAckedIds(new Set(JSON.parse(raw) as string[])); setAckReady(true); return; }
    if (sales.length === 0) return; // รอข้อมูลโหลดก่อนตั้ง baseline
    const base = sales.map(s => s.id);
    localStorage.setItem(ACK_KEY, JSON.stringify(base));
    setAckedIds(new Set(base));
    setAckReady(true);
  }, [sales, ackReady]);

  // ดีลที่ยังไม่รับทราบ = แจ้งเตือนคงค้าง (ใหม่สุดก่อน) — โชว์จนแอดมินกดยืนยัน
  const pendingAlerts: SaleAlert[] = useMemo(() => {
    if (!ackReady) return [];
    // ไม่รวมคำขอจองที่ยังรออนุมัติ (มีการ์ด/กระดิ่งของตัวเองแยกแล้ว)
    return sales.filter(s => !ackedIds.has(s.id) && String(s.custom_fields?.[STOCK_APPROVAL_FIELD] ?? "") !== "รออนุมัติ").slice(0, 50).map(s => ({
      id: s.id,
      staff: s.sales_staff || "เซลล์",
      status: String(s.sale_status ?? "ขายแล้ว"),
      title: `${s.forklift_brand} ${s.forklift_model}`.trim() || s.forklift_unit_no || "รถ",
      sub: `${s.forklift_unit_no || ""} · ${s.customer_name || "ลูกค้า"} · ฿${Number(s.actual_sale || 0).toLocaleString("th-TH")}`,
    }));
  }, [sales, ackedIds, ackReady]);

  // ยืนยันตัดออกจากสต็อก (รับทราบ) — เก็บถาวรใน localStorage เพื่อไม่เด้งซ้ำ
  const confirmAlert = (id: string) => setAckedIds(prev => {
    const next = new Set(prev); next.add(id);
    localStorage.setItem(ACK_KEY, JSON.stringify([...next]));
    return next;
  });
  const confirmAllAlerts = () => setAckedIds(prev => {
    const next = new Set(prev); pendingAlerts.forEach(a => next.add(a.id));
    localStorage.setItem(ACK_KEY, JSON.stringify([...next]));
    return next;
  });

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
  // ดีลล่าสุดต่อคัน (ทั้งก้อน) — ใช้เติมข้อมูลลูกค้าในรายงาน Export
  const saleByFk = useMemo(() => {
    const m = new Map<string, Sale>();
    [...sales]
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .forEach(s => m.set(s.forklift_id, s));
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

  // ── รถที่ผู้ขนส่งรับเข้ามาแล้ว รอฝ่ายสต็อก "ยืนยันนำเข้า" (เกตก่อนขึ้นหน้าขาย) ──
  const pendingImport = useMemo(
    () => forklifts.filter(f => String(f.status).trim() === "รอยืนยันนำเข้าสต็อก")
      .sort((a, b) => String(b.received_date || b.created_at || "").localeCompare(String(a.received_date || a.created_at || ""))),
    [forklifts]
  );
  // แปลง sale_status → สถานะรถ (กันสต็อก) — ให้ตรงกับ forkliftStatusForSale ใน AppContext
  const saleStatusToStock = (st?: string) =>
    st === "ขายแล้ว" ? "ปิดการขายแล้ว" : st === "จอง" ? "จอง" : st === "รอผ่านไฟแนนซ์" ? "รอผ่านไฟแนนซ์" : (st || "จอง");
  // ยืนยันนำเข้าสต็อก: มีเซลล์เจ้าของงาน/ดีลแล้ว → ไม่ขึ้น "พร้อมขาย" (คงสถานะตามดีล หรือ "จอง") · ไม่มี → "พร้อมขาย"
  const confirmImportOne = (f: Forklift) => {
    const sale = [...sales].filter(s => s.forklift_id === f.id)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
    const owner = saleOwnerByFk.get(f.id) || (f.custom_fields?.["เซลล์ผู้ดูแล"] as string) || "";
    const nextStatus = sale ? saleStatusToStock(sale.sale_status) : (owner ? "จอง" : "พร้อมขาย");
    const stamp = new Date().toLocaleDateString("th-TH");
    const cf = { ...(f.custom_fields || {}), "ยืนยันนำเข้าสต็อก": `${stamp} · ${username || "สต็อก"}` };
    updateForklift({ ...f, status: nextStatus, custom_fields: cf });
  };
  const ownerOf = (f: Forklift) => saleOwnerByFk.get(f.id) || (f.custom_fields?.["เซลล์ผู้ดูแล"] as string) || "";

  // ── คำขอจอง รออนุมัติ (เซลล์จองเข้ามา รอฝ่ายสต็อกอนุมัติ/ปฏิเสธ) ──
  const pendingBookings = useMemo(
    () => sales.filter(s => String(s.custom_fields?.[STOCK_APPROVAL_FIELD] ?? "") === "รออนุมัติ")
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))),
    [sales]
  );
  const [rejectBox, setRejectBox] = useState<string | null>(null); // saleId ที่กำลังจะปฏิเสธ
  const [rejectReason, setRejectReason] = useState("");

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
    else if (listSort === "pi") {
      // เรียงตามเลข PI จริง 1-2-3 · ดึงจาก pi_no ก่อน · ถ้าว่างและ id ขึ้นต้น PI (เช่น PI#27) ใช้เลขจาก id · ไม่มี PI ไปท้าย
      const piNum = (f: Forklift) => {
        const src = String(f.pi_no || "").trim() || (/^PI/i.test(String(f.id || "")) ? String(f.id) : "");
        const m = src.match(/\d+/);
        return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
      };
      rows.sort((a, b) => (piNum(a) - piNum(b)) || recent(a, b));
    }
    else rows.sort(recent); // recent / remain (remain ใช้ในมุมมอง byModel)
    return rows;
  }, [forklifts, listSearch, listCat, listBrand, listModel, listMast, listFuel, listStatus, listSort]);

  // ตัวเลือก dropdown — ไล่ระดับ ยี่ห้อ→รุ่น→เสา (นับเฉพาะที่มีจริงในสต็อก)
  const modelOpts = [...new Set(forklifts.filter(f => listBrand === "all" || (f.brand || "(ไม่ระบุ)") === listBrand).map(f => f.model).filter(Boolean))].sort();
  const mastOpts  = [...new Set(forklifts.filter(f => (listBrand === "all" || (f.brand || "(ไม่ระบุ)") === listBrand) && (listModel === "all" || f.model === listModel)).map(mastOf).filter(Boolean))].sort();
  const fuelOpts  = [...new Set(forklifts.map(f => f.fuel).filter(Boolean))].sort();

  // ส่งออกรายการสินค้าเป็น Excel (.xlsx) — ตามที่กรองอยู่ (ถ้าไม่กรองก็ทั้งหมด) เรียงตามที่แสดง
  //  · มุมมองค้างนาน → ส่งออกรายงาน Aging (พร้อมขาย + จำนวนวันค้าง)
  const exportProductsExcel = async () => {
    if (listFiltered.length === 0) return;
    const XLSX = await import("xlsx");
    if (listView === "aging") {
      const arows = agingRows.map(({ f, days }, i) => ({
        "อันดับ": i + 1,
        "รหัส (SN)": f.id ?? "",
        "SN": f.SN ?? "",
        "ยี่ห้อ": f.brand || "(ไม่ระบุ)",
        "รุ่น": mastOf(f) ? `${f.model} · เสา ${mastOf(f)}` : (f.model ?? ""),
        "ชนิด": f.vehicle_category ?? "Forklift",
        "วันรับรถ": f.received_date ?? "",
        "ค้างสต็อก (วัน)": days ?? "",
        "โลเคชั่น": f.location ?? "",
      }));
      const aws = XLSX.utils.json_to_sheet(arows);
      aws["!cols"] = [8, 16, 14, 12, 22, 14, 12, 14, 16].map(w => ({ wch: w }));
      const awb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(awb, aws, "รถค้างสต็อก");
      XLSX.writeFile(awb, `รายงานรถค้างสต็อก_${new Date().toISOString().slice(0, 10)}.xlsx`);
      return;
    }
    const rows = listFiltered.map(f => {
      const sale = saleByFk.get(f.id); // ดีลล่าสุดของคันนี้ (ถ้ามี) → เติมข้อมูลลูกค้า
      return {
      "รหัส (SN)": f.id ?? "",
      "SN": f.SN ?? "",
      "ยี่ห้อ": f.brand || "(ไม่ระบุ)",
      "รุ่น": f.model ?? "",
      "ชนิด": f.vehicle_category ?? "Forklift",
      "PI": f.pi_no ?? "",
      "พิกัดยก": f.capacity || (f.capacity_kg ? `${f.capacity_kg} kg` : ""),
      "เสา (MAST)": mastOf(f),
      "พลังงาน": f.fuel ?? "",
      "ความสูง": f.height ?? "",
      "สถานะ": String(f.status ?? ""),
      "ราคาต้นทุน": Number(f.cost_price) || 0,
      "วันรับรถ": f.received_date ?? "",
      "โลเคชั่น": f.location ?? "",
      "เซลล์ดูแล": saleOwnerByFk.get(f.id) || (f.custom_fields?.["เซลล์ผู้ดูแล"] as string) || "",
      "ลูกค้า": sale?.customer_name ?? "",
      "เบอร์ลูกค้า": sale?.customer_tel ?? "",
      "จังหวัดลูกค้า": sale?.province ?? "",
      "สถานะดีล": sale?.sale_status ?? "",
      "ราคาขาย": sale ? (Number(sale.actual_sale) || 0) : "",
      "วันเติมเข้าระบบ": String(f.created_at ?? "").slice(0, 10),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [16, 14, 12, 18, 14, 10, 12, 10, 10, 10, 14, 12, 12, 12, 16, 18, 14, 12, 16, 12, 12].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "รายการสินค้า");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `รายการสินค้า_${stamp}.xlsx`);
  };

  const catCount = (c: string) => c === "all" ? forklifts.length : forklifts.filter(f => (f.vehicle_category ?? "Forklift") === c).length;
  // ยี่ห้อที่มีจริงในสต็อก (เรียงตามจำนวนมาก→น้อย) — ทำเป็นแท็กกรอง
  const brandList = useMemo(() => {
    const m = new Map<string, number>();
    forklifts.forEach(f => { const b = f.brand || "(ไม่ระบุ)"; m.set(b, (m.get(b) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [forklifts]);
  const brandCount = (b: string) => b === "all" ? forklifts.length : (brandList.find(([n]) => n === b)?.[1] ?? 0);
  // ตัวเลือกสถานะในตัวกรอง = ค่าใน fieldConfig + สถานะจริงที่มีในข้อมูล (เช่น สั่งผลิต/รอตรวจสอบ ที่ไม่ได้อยู่ใน config)
  const statusOpts = [...new Set([...fieldConfig.stockStatuses, ...forklifts.map(f => String(f.status).trim()).filter(Boolean)])];

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

  // ── แจ้งเตือนเตรียมสั่งสินค้า — forklift เหลือ < 3 · ชนิดอื่น (ยกเว้นรีชทรัค) เหลือ < 15 ──
  const reorderAlerts = useMemo(() => {
    const g = new Map<string, { brand: string; sub: string; cat: string; ready: number; threshold: number }>();
    forklifts.forEach(f => {
      const cat = f.vehicle_category ?? "Forklift";
      if (cat === "Reach Truck") return;               // รีชทรัคไม่ต้องแจ้ง
      const isFork = cat === "Forklift";
      const mast = String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim();
      const brand = f.brand || "(ไม่ระบุ)";
      const key = isFork ? `${brand}|${f.model}|${mast}` : `${brand}|${f.model}`;
      const sub = isFork && mast ? `${f.model} · เสา ${mast}` : f.model; // ไม่ซ้ำยี่ห้อ (โชว์เป็นหัวกลุ่ม)
      const row = g.get(key) ?? { brand, sub, cat, ready: 0, threshold: isFork ? 3 : 15 };
      if (String(f.status).trim() === "พร้อมขาย") row.ready++;
      g.set(key, row);
    });
    return [...g.values()].filter(r => r.ready < r.threshold).sort((a, b) => a.ready - b.ready);
  }, [forklifts]);
  // จัดกลุ่มตามยี่ห้อ (เรียงจำนวนมากสุด) + แยกด่วน(เหลือ 0)/ใกล้หมด สำหรับแสดงผล
  const reorderByBrand = useMemo(() => {
    const m = new Map<string, typeof reorderAlerts>();
    reorderAlerts.forEach(r => { const a = m.get(r.brand) ?? []; a.push(r); m.set(r.brand, a); });
    return [...m.entries()].map(([brand, items]) => ({ brand, items })).sort((a, b) => b.items.length - a.items.length);
  }, [reorderAlerts]);
  const reorderOut = reorderAlerts.filter(r => r.ready === 0).length;   // เหลือ 0 = ต้องสั่งด่วน

  // ── FIFO เฟส 3: รายงานรถค้างสต็อกนาน (Aging) — เฉพาะพร้อมขาย เรียงค้างนานสุดก่อน ──
  const daysInStock = (f: Forklift): number | null => {
    const d = String(f.received_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const ms = Date.now() - new Date(d + "T00:00:00").getTime();
    return ms > 0 ? Math.floor(ms / 86400000) : 0;
  };
  const agingRows = useMemo(() => {
    return listFiltered
      .filter(f => String(f.status).trim() === "พร้อมขาย")
      .map(f => ({ f, days: daysInStock(f) }))
      .sort((a, b) => (b.days ?? -1) - (a.days ?? -1)); // ค้างนานสุดก่อน · ไม่มีวันรับ = ท้ายสุด
  }, [listFiltered]);
  const agingOver90 = agingRows.filter(r => (r.days ?? 0) > 90).length;
  const agingOver180 = agingRows.filter(r => (r.days ?? 0) > 180).length;

  // ── ประวัติการขาย: รายชื่อเซลล์ + ดีลกรองแล้ว (ล่าสุดบน) ──
  const histStaffOptions = useMemo(() => [...new Set(sales.map(s => s.sales_staff).filter(Boolean))].sort(), [sales]);
  const histFiltered = useMemo(() => {
    const q = histSearch.trim().toLowerCase();
    return sales
      .filter(s => !isVoidSale(s)) // ตัดดีลที่ถูกปฏิเสธจากสต็อกออกจากประวัติการขาย
      .filter(s => {
        const okStaff = histStaff === "all" || s.sales_staff === histStaff;
        const okStatus = histStatus === "all" || saleStatusGroup(s.sale_status) === histStatus;
        const okQ = !q || [s.customer_name, s.customer_tel, s.forklift_unit_no, s.forklift_brand, s.forklift_model, s.sales_staff].some(v => String(v ?? "").toLowerCase().includes(q));
        return okStaff && okStatus && okQ;
      })
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))); // ล่าสุดบน
  }, [sales, histStaff, histStatus, histSearch]);

  // สรุปยอดรายเซลล์ (จากดีลที่กรองอยู่) — จำนวนดีล/ยอดขาย/ปิดได้/ค้าง
  const staffSummary = useMemo(() => {
    const m = new Map<string, { staff: string; deals: number; revenue: number; closed: number; pending: number }>();
    histFiltered.forEach(s => {
      const staff = s.sales_staff || "ไม่ระบุ";
      const g = m.get(staff) ?? { staff, deals: 0, revenue: 0, closed: 0, pending: 0 };
      g.deals++;
      g.revenue += Number(s.actual_sale) || 0;
      if (saleStatusGroup(s.sale_status) === "ขายแล้ว/ปิดการขาย") g.closed++; else g.pending++;
      m.set(staff, g);
    });
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [histFiltered]);

  // Export ประวัติการขายเป็น Excel (ตามที่กรองอยู่ — ทั้งหมด/รายเซลล์)
  // Export ประวัติการขาย — ได้ทั้ง 2 ชีต: รายละเอียดรายดีล + สรุปรายเซลล์ (ไม่ว่าจะดูมุมมองไหน)
  const exportSaleHistory = async () => {
    if (histFiltered.length === 0) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // ชีต 1: รายละเอียดทุกดีล (ขายอะไร/ให้ใคร/เท่าไหร่/เมื่อไหร่)
    const rows = histFiltered.map(s => ({
      "วันที่": s.created_at ?? "", "สถานะ": s.sale_status ?? "ขายแล้ว", "เซลล์": s.sales_staff ?? "",
      "SN": s.forklift_unit_no ?? "", "ยี่ห้อ/รุ่น": `${s.forklift_brand ?? ""} ${s.forklift_model ?? ""}`.trim(),
      "ลูกค้า": s.customer_name ?? "", "เบอร์โทร": s.customer_tel ?? "", "จังหวัด": s.province ?? "",
      "ประเภทลูกค้า": (s.customer_type as string) ?? "", "การชำระ": s.payment_type ?? "",
      "ราคาขาย": Number(s.actual_sale) || 0, "มัดจำ": Number(s.deposit) || 0,
      "ค่าขนส่ง": Number(s.shipping_cost) || 0, "วันส่งมอบ": s.delivery_date ?? "",
      "รถสั่งผลิต": isPendingId(s.forklift_id) ? "ใช่" : "", "วันคาดรับ": (s.custom_fields?.["วันคาดรับรถสั่งผลิต"] as string) ?? "",
      "เลขที่ใบกำกับ": (s.custom_fields?.["เลขที่ใบกำกับภาษี"] as string) ?? "", "หมายเหตุ": s.remark ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [12, 16, 14, 14, 20, 20, 12, 10, 12, 12, 12, 10, 10, 12, 10, 12, 14, 18].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "รายดีล (รายละเอียด)");
    // ชีต 2: สรุปรายเซลล์
    const srows = staffSummary.map(g => ({
      "เซลล์": g.staff, "จำนวนดีล": g.deals, "ยอดขายรวม": g.revenue, "ปิดการขายได้": g.closed, "กำลังดำเนินการ": g.pending,
    }));
    const sws = XLSX.utils.json_to_sheet(srows);
    sws["!cols"] = [16, 10, 14, 12, 14].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, sws, "สรุปรายเซลล์");
    const who = histStaff === "all" ? "ทุกเซลล์" : histStaff;
    XLSX.writeFile(wb, `ประวัติการขาย_${who}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  // เปิดกางรายละเอียดดีล + เตรียมช่องแก้ไข (รวมวันคาดรับรถสั่งผลิต)
  const openHistDetail = (s: Sale) => {
    setHistDetail(s);
    setHistEdit({
      sale_status: s.sale_status ?? "ขายแล้ว", delivery_date: s.delivery_date ?? "", remark: s.remark ?? "",
      eta: (s.custom_fields?.["วันคาดรับรถสั่งผลิต"] as string) ?? "",
      sn: s.forklift_unit_no ?? "",
      commCat: (s.custom_fields?.[COMMISSION_FIELD] as string) ?? "",
    });
  };
  const saveHistEdit = () => {
    if (!histDetail || !histEdit) return;
    // เก็บ diff เป็น audit log (ง) — ใครแก้อะไรเมื่อไหร่
    const changes: string[] = [];
    if (histEdit.sale_status !== (histDetail.sale_status ?? "ขายแล้ว")) changes.push(`สถานะ→${histEdit.sale_status}`);
    if (histEdit.delivery_date !== (histDetail.delivery_date ?? "")) changes.push(`วันส่งมอบ→${histEdit.delivery_date || "-"}`);
    if (histEdit.eta.trim() !== ((histDetail.custom_fields?.["วันคาดรับรถสั่งผลิต"] as string) ?? "")) changes.push(`วันคาดรับ→${histEdit.eta.trim() || "-"}`);
    if (histEdit.remark !== (histDetail.remark ?? "")) changes.push("แก้หมายเหตุ");
    const snChanged = !!histEdit.sn.trim() && histEdit.sn.trim() !== (histDetail.forklift_unit_no ?? "");
    if (snChanged) changes.push(`เติม SN→${histEdit.sn.trim()}`); // ก: รถสั่งผลิตมาถึง เติม SN จริง
    if (histEdit.commCat !== ((histDetail.custom_fields?.[COMMISSION_FIELD] as string) ?? "")) changes.push(`หมวดค่าคอม→${histEdit.commCat || "-"}`);

    const cf: Record<string, string> = { ...(histDetail.custom_fields ?? {}) };
    if (histEdit.eta.trim()) cf["วันคาดรับรถสั่งผลิต"] = histEdit.eta.trim(); else delete cf["วันคาดรับรถสั่งผลิต"];
    if (histEdit.commCat) cf[COMMISSION_FIELD] = histEdit.commCat; else delete cf[COMMISSION_FIELD];
    if (changes.length) {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const line = `${stamp} · ${username || "สต็อก"}: ${changes.join(", ")}`;
      cf["ประวัติแก้ไข"] = [(histDetail.custom_fields?.["ประวัติแก้ไข"] as string) || "", line].filter(Boolean).join("\n");
    }
    const u: Sale = { ...histDetail, sale_status: histEdit.sale_status as Sale["sale_status"], delivery_date: histEdit.delivery_date, remark: histEdit.remark,
      forklift_unit_no: snChanged ? histEdit.sn.trim() : histDetail.forklift_unit_no,
      custom_fields: Object.keys(cf).length ? cf : undefined };
    updateSale(u); setHistDetail(u);
    // เติม SN ลง forklift ด้วย (ก) — โชว์ SN จริงแทนรหัสชั่วคราว PI#N
    if (snChanged) {
      const fk = forklifts.find(f => f.id === histDetail.forklift_id);
      if (fk) updateForklift({ ...fk, SN: histEdit.sn.trim() });
    }
    setHistEdit({ ...histEdit, sn: snChanged ? histEdit.sn.trim() : histEdit.sn });
  };

  // ── helper รถสั่งผลิต (เฟส 2) ──
  const addDaysStr = (dateStr: string, n: number): string => {
    const d = String(dateStr || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
    const dt = new Date(d + "T00:00:00"); dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
  };
  const daysUntil = (dateStr: string): number | null => {
    const d = String(dateStr || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return Math.round((new Date(d + "T00:00:00").getTime() - Date.now()) / 86400000);
  };

  // ── เฟส 3: รถสั่งผลิตที่ต้องติดตาม (ใกล้ครบ ≤14 วัน หรือเกินกำหนด) ที่ยังไม่ส่งมอบ ──
  const madeToOrderAlerts = useMemo(() => {
    return sales
      .filter(s => isPendingId(s.forklift_id) && (s.sale_status ?? "") !== "ปิดการขาย/จัดส่งแล้ว")
      .map(s => {
        const order = String(s.created_at || "").slice(0, 10);
        const custom = (s.custom_fields?.["วันคาดรับรถสั่งผลิต"] as string) || "";
        const eta = custom || addDaysStr(order, 90); // ไม่กรอกวันคาดจริง → ใช้ปลายช่วง 90 วัน
        return { s, eta, left: daysUntil(eta), custom: !!custom };
      })
      .filter(x => x.left != null && x.left <= 14)
      .sort((a, b) => (a.left ?? 0) - (b.left ?? 0)); // เกินมากสุดก่อน
  }, [sales]);
  const overdueMTO = madeToOrderAlerts.filter(x => (x.left ?? 0) < 0); // เกินกำหนดแล้ว → เด้งกระดิ่ง (ข)

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
            {/* กระดิ่ง 0 (ส้ม) — คำขอจอง รออนุมัติ (ต้องกดอนุมัติ/ปฏิเสธ) → คลิกเลื่อนไปการ์ด */}
            <button onClick={() => document.getElementById("pending-bookings")?.scrollIntoView({ behavior: "smooth" })}
              title="คำขอจอง รออนุมัติจากสต็อก"
              className="relative flex items-center text-slate-600 hover:text-orange-600 hover:bg-orange-50 p-2 rounded-lg transition-all border border-transparent hover:border-orange-200">
              <ShoppingCart className="w-5 h-5" />
              {pendingBookings.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{pendingBookings.length}</span>
              )}
            </button>
            {/* กระดิ่ง 2 (ชมพู) — ออเดอร์ขายจากเซลล์ รอรับทราบ → คลิกเปิดกล่องแจ้งเตือน */}
            <button onClick={() => setShowAlerts(true)}
              title="ออเดอร์ขายจากเซลล์ รอรับทราบ"
              className="relative flex items-center text-slate-600 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-all border border-transparent hover:border-rose-200">
              <Bell className="w-5 h-5" />
              {pendingAlerts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{pendingAlerts.length}</span>
              )}
            </button>
            <button onClick={() => setShowSaleHistory(true)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-indigo-200">
              <ShoppingCart className="w-4 h-4" /><span className="hidden sm:inline">ประวัติการขาย</span>
            </button>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="เหลือ (พร้อมขาย)" value={available} onClick={() => showStatus("พร้อมขาย")} icon={<TrendingUp className="w-4 h-4" />} color="text-emerald-700" bg="bg-emerald-50 border-emerald-100" iconBg="bg-emerald-100 text-emerald-600" />
          <StatCard label="จอง"              value={reserved}  onClick={() => showStatus("จอง")} icon={<Boxes className="w-4 h-4" />}       color="text-amber-700"   bg="bg-amber-50 border-amber-100"   iconBg="bg-amber-100 text-amber-600" />
          <StatCard label="ติดไฟแนนซ์"       value={financing} onClick={() => showStatus("รอผ่านไฟแนนซ์")} icon={<Clock className="w-4 h-4" />}       color="text-rose-700"    bg="bg-rose-50 border-rose-100"     iconBg="bg-rose-100 text-rose-600" />
          <StatCard label="ขายไปแล้ว"        value={sold}      onClick={() => showStatus("ปิดการขายแล้ว")} icon={<CheckCircle className="w-4 h-4" />} color="text-indigo-700"  bg="bg-indigo-50 border-indigo-100" iconBg="bg-indigo-100 text-indigo-600" />
          <StatCard label="เตรียมสั่งสินค้า" value={reorderAlerts.length}
            onClick={() => { setShowReorder(v => !v); setTimeout(() => document.getElementById("reorder-list")?.scrollIntoView({ behavior: "smooth" }), 60); }}
            icon={<AlertCircle className="w-4 h-4" />} color="text-amber-700" bg="bg-amber-50 border-amber-200" iconBg="bg-amber-100 text-amber-600" />
        </div>
        {waiting > 0 && (
          <div className="-mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" />มีรถรอรับเข้าคลังอีก <b className="text-blue-700">{waiting}</b> คัน (ยังไม่ขึ้นหน้าขาย)
          </div>
        )}

        {/* ── 🔔 รถรับเข้าใหม่ รอฝ่ายสต็อกยืนยันนำเข้า (เกตก่อนขึ้นหน้าขาย) ── */}
        {pendingImport.length > 0 && (
          <div id="pending-import" className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                </span>
                <h3 className="text-sm font-bold text-blue-800">🔔 รถรับเข้าใหม่ รอยืนยันนำเข้าสต็อก — {pendingImport.length} คัน</h3>
              </div>
              {pendingImport.length > 1 && (confirmAllImport ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-blue-700">ยืนยันทั้งหมด?</span>
                  <button onClick={() => { pendingImport.forEach(confirmImportOne); setConfirmAllImport(false); }}
                    className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg">ยืนยัน</button>
                  <button onClick={() => setConfirmAllImport(false)} className="text-xs text-slate-500 hover:text-slate-700 px-1.5">ยกเลิก</button>
                </div>
              ) : (
                <button onClick={() => setConfirmAllImport(true)}
                  className="text-xs font-bold bg-blue-100 hover:bg-blue-200 text-blue-700 px-2.5 py-1.5 rounded-lg transition-colors">ยืนยันทั้งหมด</button>
              ))}
            </div>
            <p className="text-xs text-blue-600 mb-3">ผู้ขนส่งบันทึกการรับรถแล้ว — ตรวจสอบแล้วกด &ldquo;ยืนยันนำเข้า&rdquo; เพื่อให้รถขึ้นหน้าขาย · รถที่มีเซลล์เจ้าของงานจะไม่ขึ้นพร้อมขาย (ตั้งเป็นจอง)</p>
            <div className="flex flex-col gap-2">
              {pendingImport.map(f => {
                const owner = ownerOf(f);
                const recv = [...inspections]
                  .filter(r => String(r.unit_no || "").toUpperCase() === String(f.SN || f.id).toUpperCase() && (r.role ?? "ผู้รับรถ") === "ผู้รับรถ")
                  .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
                return (
                  <div key={f.id} className="bg-white border border-blue-100 rounded-xl p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md flex-shrink-0">#{f.id}</span>
                        <span className="font-semibold text-slate-800 text-sm">{f.SN ? `${f.SN} — ` : ""}{f.brand} {f.model}</span>
                        {owner && <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 flex-shrink-0"><User className="w-2.5 h-2.5" />#{owner}</span>}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {[f.pi_no ? `PI ${f.pi_no}` : "", recv ? `รับโดย ${recv.transporter_name} · ${recv.date}` : (f.received_date ? `วันรับ ${f.received_date}` : "")].filter(Boolean).join(" · ")}
                        {owner ? " · จะเข้าสถานะ “จอง” (มีเซลล์เจ้าของงาน)" : " · จะขึ้น “พร้อมขาย”"}
                      </p>
                    </div>
                    <button onClick={() => confirmImportOne(f)}
                      className="flex-shrink-0 flex items-center gap-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all active:scale-95">
                      <CheckCircle className="w-3.5 h-3.5" />ยืนยันนำเข้า
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 🔔 คำขอจอง รออนุมัติ (เซลล์จองเข้ามา → สต็อกอนุมัติ/ปฏิเสธ) ── */}
        {pendingBookings.length > 0 && (
          <div id="pending-bookings" className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500" />
              </span>
              <h3 className="text-sm font-bold text-orange-800">🔔 คำขอจอง รออนุมัติ — {pendingBookings.length} รายการ</h3>
            </div>
            <p className="text-xs text-orange-600 mb-3">เซลล์จองรถเข้ามา — ตรวจแล้วกด &ldquo;อนุมัติจอง&rdquo; เพื่อยืนยันสต็อกออก (รถจะเป็น &ldquo;จอง&rdquo;) · หรือ &ldquo;ปฏิเสธ&rdquo; เพื่อคืนรถสู่สต็อก</p>
            <div className="flex flex-col gap-2">
              {pendingBookings.map(s => {
                const f = forklifts.find(x => x.id === s.forklift_id);
                return (
                  <div key={s.id} className="bg-white border border-orange-100 rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md flex-shrink-0">#{s.forklift_id}</span>
                          <span className="font-semibold text-slate-800 text-sm">{s.forklift_unit_no ? `${s.forklift_unit_no} — ` : ""}{s.forklift_brand} {s.forklift_model}</span>
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">{s.sale_status}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                          เซลล์ {s.sales_staff || "—"} · ลูกค้า {s.customer_name || "—"} · ฿{Number(s.actual_sale || 0).toLocaleString("th-TH")}{f?.pi_no ? ` · PI ${f.pi_no}` : ""}
                        </p>
                      </div>
                    </div>
                    {rejectBox === s.id ? (
                      <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2">
                        <input autoFocus value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="เหตุผลที่ปฏิเสธ (เช่น รถติดจองแล้ว)..."
                          className="flex-1 min-w-0 text-xs border border-red-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white text-slate-800" />
                        <button onClick={() => { rejectStockSale(s.id, rejectReason.trim(), username); setRejectBox(null); setRejectReason(""); }}
                          className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-lg flex-shrink-0">ยืนยันปฏิเสธ</button>
                        <button onClick={() => { setRejectBox(null); setRejectReason(""); }} className="text-xs text-slate-500 hover:text-slate-700 px-1.5 flex-shrink-0">ยกเลิก</button>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-2">
                        <button onClick={() => approveStockSale(s.id, username)}
                          className="flex-1 flex items-center justify-center gap-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-all active:scale-95">
                          <CheckCircle className="w-3.5 h-3.5" />อนุมัติจอง
                        </button>
                        <button onClick={() => { setRejectBox(s.id); setRejectReason(""); }}
                          className="flex items-center justify-center gap-1 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-2 rounded-lg transition-all">
                          <X className="w-3.5 h-3.5" />ปฏิเสธ
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── รายการเตรียมสั่งสินค้า (กางจากการ์ด "เตรียมสั่งสินค้า") ── */}
        {showReorder && reorderAlerts.length > 0 && (
          <div id="reorder-list" className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-800">เตรียมสั่งสินค้า — {reorderAlerts.length} รุ่นใกล้หมด</h3>
              </div>
              <button onClick={() => setShowReorder(false)} className="text-amber-500 hover:text-amber-800 hover:bg-amber-100 rounded-lg p-1"><X className="w-4 h-4" /></button>
            </div>
            {/* สรุปด้านบน — เห็นภาพรวมก่อน */}
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="text-xs font-bold bg-red-100 text-red-700 px-2.5 py-1 rounded-lg">🔴 หมดแล้ว (สั่งด่วน): {reorderOut} รุ่น</span>
              <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg">🟡 ใกล้หมด: {reorderAlerts.length - reorderOut} รุ่น</span>
              <span className="text-[11px] text-amber-600 self-center">เกณฑ์: โฟล์คลิฟท์ &lt; 3 · ชนิดอื่น &lt; 15 (รีชทรัคไม่นับ)</span>
            </div>
            {/* จัดกลุ่มตามยี่ห้อ — อ่านง่าย */}
            <div className="flex flex-col gap-3">
              {reorderByBrand.map(({ brand, items }) => (
                <div key={brand} className="bg-white/70 border border-amber-100 rounded-xl p-3">
                  <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded">{brand}</span>
                    <span className="text-slate-400 font-medium">{items.length} รุ่น</span>
                  </p>
                  <div className="flex flex-col gap-1">
                    {items.map((r, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-slate-700 truncate">{r.sub}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${r.ready === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {r.ready === 0 ? "หมด" : `เหลือ ${r.ready}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── แจ้งเตือนติดตามรถสั่งผลิต (ใกล้ครบ/เกินกำหนด) ── */}
        {madeToOrderAlerts.length > 0 && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-base">🏭</span>
              <h3 className="text-sm font-bold text-violet-800">ติดตามรถสั่งผลิต — {madeToOrderAlerts.length} รายการใกล้ครบ/เกินกำหนด</h3>
            </div>
            <div className="flex flex-col gap-2">
              {madeToOrderAlerts.map(({ s, eta, left, custom }) => (
                <button key={s.id} onClick={() => { openHistDetail(s); setShowSaleHistory(true); }}
                  className="text-left bg-white border border-violet-100 rounded-xl p-3 hover:border-violet-300 transition-all flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{s.forklift_brand} {s.forklift_model} <span className="text-slate-400 font-normal">· {s.forklift_unit_no || s.forklift_id}</span></p>
                    <p className="text-xs text-slate-500 truncate">{s.customer_name || "ไม่ระบุลูกค้า"} · เซลล์ {s.sales_staff || "—"} · คาดรับ {eta}{custom ? "" : " (ประมาณ)"}</p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${(left ?? 0) < 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                    {(left ?? 0) < 0 ? `เกิน ${-(left ?? 0)} วัน` : (left === 0 ? "ครบวันนี้" : `อีก ${left} วัน`)}
                  </span>
                </button>
              ))}
            </div>
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
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-800">รายการสต็อก</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {listView === "byModel"
                      ? `${byModel.length} รุ่น · ${listFiltered.length} คัน`
                      : `แสดง ${listFiltered.length} จาก ${forklifts.length} คัน`}
                  </p>
                </div>
                <button onClick={exportProductsExcel} disabled={listFiltered.length === 0}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                  <Download className="w-4 h-4" /><span className="hidden sm:inline">Export Excel</span>
                </button>
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
                  {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={listSort} onChange={e => setListSort(e.target.value as typeof listSort)}
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="recent">เรียง: เติมล่าสุด</option>
                  <option value="model">เรียง: ตามรุ่น</option>
                  <option value="sn">เรียง: ตาม SN</option>
                  <option value="pi">เรียง: ตาม PI</option>
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
                  <button onClick={() => setListView("aging")}
                    className={`px-2.5 py-1.5 transition ${listView === "aging" ? "bg-amber-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ค้างนาน</button>
                </div>
              </div>
            </div>
            <div className="overflow-auto max-h-[72vh] p-4 flex flex-col gap-2">
              {listFiltered.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">ไม่พบรถตามเงื่อนไข</div>
              )}

              {/* ── มุมมองค้างนาน (Aging) — พร้อมขาย เรียงค้างสต็อกนานสุดก่อน ── */}
              {listView === "aging" && listFiltered.length > 0 && (
                agingRows.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">ไม่มีรถ &ldquo;พร้อมขาย&rdquo; ในเงื่อนไขนี้</div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 mb-1">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-semibold">พร้อมขาย {agingRows.length} คัน</span>
                      {agingOver90 > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-semibold">ค้าง &gt; 90 วัน: {agingOver90}</span>}
                      {agingOver180 > 0 && <span className="text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-lg font-semibold">ค้าง &gt; 180 วัน: {agingOver180}</span>}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-100">
                            {["#", "รหัส", "ยี่ห้อ/รุ่น", "SN", "วันรับรถ", "ค้างสต็อก", "โลเคชั่น"].map((h, i) => (
                              <th key={i} className="px-2.5 py-2 font-semibold whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {agingRows.map(({ f, days }, i) => {
                            const tone = days == null ? "" : days > 180 ? "bg-red-50" : days > 90 ? "bg-amber-50" : "";
                            const dtone = days == null ? "text-slate-400" : days > 180 ? "text-red-600" : days > 90 ? "text-amber-600" : "text-slate-600";
                            const mast = String((f.custom_fields as Record<string, unknown> | undefined)?.["MAST"] ?? "").trim();
                            return (
                              <tr key={f.id} onClick={() => setDetailItem(f)} className={`border-b border-slate-50 hover:bg-emerald-50/60 cursor-pointer transition-colors ${tone}`}>
                                <td className="px-2.5 py-2 text-slate-400 font-bold">{i + 1}</td>
                                <td className="px-2.5 py-2 whitespace-nowrap"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md text-slate-500 bg-slate-100 border border-slate-200">#{f.id}</span></td>
                                <td className="px-2.5 py-2"><span className="font-semibold text-slate-800">{f.brand}</span> <span className="text-slate-500">{f.model}{mast ? ` · เสา ${mast}` : ""}</span></td>
                                <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{f.SN || "—"}</td>
                                <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{f.received_date || "—"}</td>
                                <td className={`px-2.5 py-2 whitespace-nowrap font-bold ${dtone}`}>{days == null ? "ไม่ระบุวันรับ" : `${days} วัน`}</td>
                                <td className="px-2.5 py-2 text-slate-500 whitespace-nowrap">{f.location || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
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
                      {ownerOf(item) && (
                        <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded-md flex-shrink-0 flex items-center gap-0.5" title="เซลล์เจ้าของงาน"><User className="w-2.5 h-2.5" />#{ownerOf(item)}</span>
                      )}
                      {idx === 0 && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full flex-shrink-0">ล่าสุด</span>}
                    </div>
                    <p className="text-xs text-slate-500">{[
                      item.capacity || (item.capacity_kg ? `${item.capacity_kg} kg` : ""),
                      item.custom_fields?.["ประเภทสินค้า"],
                      item.fuel,
                      item.height ? `สูง ${item.height}` : "",
                      item.location,
                    ].filter(Boolean).join(" · ") || "—"}</p>
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

      {/* ── กล่องแจ้งเตือนคงค้าง: เซลล์ทำรายการขาย → แอดมินอ่าน + กดยืนยันตัดออกจากสต็อก ── */}
      {showAlerts && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center sm:justify-end p-4 sm:p-6" onClick={() => setShowAlerts(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm max-h-[80vh] flex flex-col mt-14" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-rose-500" />
                <h3 className="text-sm font-bold text-slate-800">รายการรอยืนยันตัดออกจากสต็อก</h3>
              </div>
              <button onClick={() => setShowAlerts(false)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5"><X className="w-4 h-4" /></button>
            </div>
            {pendingAlerts.length > 0 && (
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-slate-500">{pendingAlerts.length} รายการใหม่</span>
                <button onClick={confirmAllAlerts} className="text-xs font-bold text-emerald-700 hover:text-emerald-900">✓ ยืนยันทั้งหมด</button>
              </div>
            )}
            <div className="overflow-y-auto p-3 flex flex-col gap-2.5">
              {/* ข: รถสั่งผลิตเกินกำหนด เด้งในกระดิ่ง */}
              {overdueMTO.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-bold text-violet-700">🏭 รถสั่งผลิตเกินกำหนด ({overdueMTO.length})</p>
                  {overdueMTO.map(({ s, eta, left }) => (
                    <button key={s.id} onClick={() => { setShowAlerts(false); openHistDetail(s); setShowSaleHistory(true); }}
                      className="text-left bg-violet-50 border border-violet-200 rounded-xl p-2.5 hover:border-violet-300">
                      <p className="text-xs font-bold text-slate-800 truncate">{s.forklift_brand} {s.forklift_model}</p>
                      <p className="text-[11px] text-slate-500 truncate">{s.customer_name || "ลูกค้า"} · เซลล์ {s.sales_staff || "—"}</p>
                      <p className="text-[11px] font-bold text-red-600">เกินกำหนด {-(left ?? 0)} วัน (คาดรับ {eta})</p>
                    </button>
                  ))}
                  {pendingAlerts.length > 0 && <div className="h-px bg-slate-100 my-1" />}
                </div>
              )}
              {pendingAlerts.length === 0 ? (
                overdueMTO.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-sm flex flex-col items-center gap-2">
                  <CheckCircle className="w-8 h-8 opacity-40" />ไม่มีรายการค้าง
                </div>
                )
              ) : pendingAlerts.map(al => {
                const green = al.status.includes("ขาย") || al.status.includes("ปิด");
                const amber = al.status.includes("จอง") || al.status.includes("มัดจำ") || al.status.includes("จัดส่ง");
                const c = green ? { bar: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700", ic: "text-emerald-600" }
                        : amber ? { bar: "bg-amber-500",   chip: "bg-amber-100 text-amber-700",     ic: "text-amber-600" }
                        :         { bar: "bg-rose-500",    chip: "bg-rose-100 text-rose-700",       ic: "text-rose-600" };
                return (
                  <div key={al.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden flex">
                    <div className={`w-1.5 flex-shrink-0 ${c.bar}`} />
                    <div className="flex-1 min-w-0 p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><ShoppingCart className={`w-3.5 h-3.5 ${c.ic}`} />เซลล์ทำรายการ</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.chip}`}>{al.status}</span>
                      </div>
                      <p className="font-bold text-slate-800 text-sm truncate">{al.title}</p>
                      <p className="text-xs text-slate-500 truncate">{al.sub}</p>
                      <p className="text-[11px] text-slate-400 mt-1">โดย {al.staff}</p>
                      <button onClick={() => confirmAlert(al.id)}
                        className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />ยืนยันตัดออกจากสต็อก
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ประวัติการขาย (เฟส 1): ดีลทุกเซลล์ · ล่าสุดบน · กรองรายเซลล์ · แก้ไขได้ ── */}
      {showSaleHistory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowSaleHistory(false)}>
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-800">ประวัติการขาย</h3>
                <p className="text-xs text-slate-500 mt-0.5">ดีลทั้งหมด {histFiltered.length} รายการ (ล่าสุดบน)</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportSaleHistory} disabled={histFiltered.length === 0}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download className="w-4 h-4" /><span className="hidden sm:inline">Export</span>
                </button>
                <button onClick={() => setShowSaleHistory(false)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-2 flex-shrink-0">
              <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="ค้นหา ลูกค้า / SN / รุ่น / เซลล์..."
                className="flex-1 min-w-[160px] border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-slate-800" />
              <select value={histStaff} onChange={e => setHistStaff(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="all">ทุกเซลล์</option>
                {histStaffOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={histStatus} onChange={e => setHistStatus(e.target.value)} className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="all">ทุกสถานะ</option>
                {SALE_STATUS_FILTER_GROUPS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
                <button onClick={() => setHistView("deals")} className={`px-3 py-1.5 transition ${histView === "deals" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📋 รายดีล</button>
                <button onClick={() => setHistView("summary")} className={`px-3 py-1.5 transition ${histView === "summary" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📊 สรุปรายเซลล์</button>
              </div>
            </div>

            {/* มุมมองสรุปรายเซลล์ */}
            {histView === "summary" && (
              <div className="overflow-y-auto flex-1 min-h-0 p-3">
                {staffSummary.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-sm">ไม่มีข้อมูล</div>
                ) : (<>
                  {/* ค: กราฟแท่งยอดขายรายเซลล์ (เทียบสัดส่วน) */}
                  <div className="mb-4 flex flex-col gap-1.5">
                    {(() => { const max = Math.max(...staffSummary.map(g => g.revenue), 1); return staffSummary.slice(0, 10).map((g, i) => (
                      <div key={g.staff} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-24 truncate flex-shrink-0" title={g.staff}>{i + 1}. {g.staff}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 flex items-center justify-end pr-1.5" style={{ width: `${Math.max((g.revenue / max) * 100, 3)}%` }}>
                            <span className="text-[9px] font-bold text-white whitespace-nowrap">฿{fmtM(g.revenue)}</span>
                          </div>
                        </div>
                      </div>
                    )); })()}
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                        {["เซลล์", "ดีล", "ยอดขายรวม", "ปิดได้", "ค้าง"].map((h, i) => <th key={i} className={`px-3 py-2 font-semibold ${i >= 1 ? "text-right" : ""}`}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {staffSummary.map((g, i) => (
                        <tr key={g.staff} onClick={() => { setHistStaff(g.staff === "ไม่ระบุ" ? "all" : g.staff); setHistView("deals"); }}
                          className="border-b border-slate-50 hover:bg-indigo-50/50 cursor-pointer transition-colors" title="คลิกดูรายดีลของเซลล์คนนี้">
                          <td className="px-3 py-2.5"><span className="text-xs font-bold text-slate-400 mr-1.5">{i + 1}</span><span className="font-semibold text-slate-800">{g.staff}</span> <ChevronRight className="w-3 h-3 text-slate-300 inline" /></td>
                          <td className="px-3 py-2.5 text-right text-slate-700 font-semibold">{g.deals}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-indigo-700">฿{g.revenue.toLocaleString("th-TH")}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-600 font-semibold">{g.closed}</td>
                          <td className="px-3 py-2.5 text-right text-amber-600 font-semibold">{g.pending}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-indigo-50 border-t border-indigo-100 font-bold text-indigo-800">
                        <td className="px-3 py-2.5">รวม {staffSummary.length} คน</td>
                        <td className="px-3 py-2.5 text-right">{staffSummary.reduce((a, g) => a + g.deals, 0)}</td>
                        <td className="px-3 py-2.5 text-right">฿{staffSummary.reduce((a, g) => a + g.revenue, 0).toLocaleString("th-TH")}</td>
                        <td className="px-3 py-2.5 text-right">{staffSummary.reduce((a, g) => a + g.closed, 0)}</td>
                        <td className="px-3 py-2.5 text-right">{staffSummary.reduce((a, g) => a + g.pending, 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </>)}
              </div>
            )}

            {histView === "deals" && (
            <div className="overflow-y-auto flex-1 min-h-0 p-3 flex flex-col gap-2">
              {histFiltered.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-sm">ไม่พบดีลตามเงื่อนไข</div>
              ) : histFiltered.map(s => (
                <button key={s.id} onClick={() => openHistDetail(s)}
                  className="text-left bg-slate-50 border border-slate-100 rounded-xl p-3 hover:border-indigo-200 hover:bg-white transition-all">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs text-slate-400">{s.created_at}</span>
                    <div className="flex items-center gap-1.5">
                      {isPendingId(s.forklift_id) && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">🏭 สั่งผลิต</span>}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${SALE_STATUS_BADGE[s.sale_status ?? "ขายแล้ว"] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}>{s.sale_status ?? "ขายแล้ว"}</span>
                    </div>
                  </div>
                  <p className="font-bold text-slate-800 text-sm">{s.forklift_brand} {s.forklift_model} <span className="text-slate-400 font-normal">· {s.forklift_unit_no}</span></p>
                  <p className="text-xs text-slate-500">{s.customer_name || "ไม่ระบุลูกค้า"}{s.province ? ` · ${s.province}` : ""}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">เซลล์: {s.sales_staff || "—"}</span>
                    <span className="text-sm font-bold text-indigo-700">฿{Number(s.actual_sale || 0).toLocaleString("th-TH")}</span>
                  </div>
                </button>
              ))}
            </div>
            )}
          </div>

          {/* รายละเอียดดีล + แก้ไข (ฝ่ายสต็อก) */}
          {histDetail && histEdit && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setHistDetail(null)}>
              <div className="bg-white rounded-3xl w-full max-w-lg max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-blue-700 flex items-center justify-between flex-shrink-0">
                  <div>
                    <h3 className="text-base font-bold text-white">รายละเอียดดีล</h3>
                    <p className="text-xs text-indigo-200">{histDetail.forklift_unit_no} — {histDetail.forklift_brand} {histDetail.forklift_model}</p>
                  </div>
                  <button onClick={() => setHistDetail(null)} className="text-white/70 hover:text-white hover:bg-white/20 rounded-xl p-2"><X className="w-5 h-5" /></button>
                </div>
                <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["ลูกค้า", histDetail.customer_name], ["เบอร์โทร", histDetail.customer_tel],
                      ["ประเภทลูกค้า", histDetail.customer_type], ["จังหวัด", histDetail.province],
                      ["การชำระ", histDetail.payment_type], ["บริษัทไฟแนนซ์", histDetail.finance_company],
                      ["ราคาขาย", histDetail.actual_sale ? `฿${Number(histDetail.actual_sale).toLocaleString()}` : ""],
                      ["มัดจำ", histDetail.deposit ? `฿${Number(histDetail.deposit).toLocaleString()}` : ""],
                      ["ค่าขนส่ง", histDetail.shipping_cost ? `฿${Number(histDetail.shipping_cost).toLocaleString()}` : ""],
                      ["เซลล์", histDetail.sales_staff], ["วันที่ทำรายการ", histDetail.created_at],
                    ] as [string, string][]).filter(([, v]) => String(v ?? "").trim()).map(([k, v]) => (
                      <div key={k} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2"><p className="text-[11px] text-slate-400">{k}</p><p className="font-semibold text-slate-700 break-words">{v}</p></div>
                    ))}
                  </div>
                  {histDetail.add_ons?.length ? (
                    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                      <p className="text-[11px] text-slate-400 mb-1">อุปกรณ์เสริม</p>
                      {histDetail.add_ons.map((a, i) => <p key={i} className="text-xs text-slate-700">{a.name} — ฿{Number(a.price).toLocaleString()}</p>)}
                    </div>
                  ) : null}
                  {/* รถสั่งผลิต (เฟส 2): ETA นับจากวันสั่งผลิต (วันทำรายการ) 60-90 วัน + กรอกวันคาดจริง */}
                  {isPendingId(histDetail.forklift_id) && (() => {
                    const orderDate = String(histDetail.created_at || "").slice(0, 10);
                    const eta = histEdit.eta.trim();
                    const left = eta ? daysUntil(eta) : null;
                    return (
                      <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 flex flex-col gap-2">
                        <p className="text-xs font-bold text-violet-800 flex items-center gap-1.5">🏭 รถสั่งผลิต — ติดตามการผลิต</p>
                        <p className="text-[11px] text-violet-600">
                          สั่งผลิตเมื่อ <b>{orderDate || "ไม่ระบุ"}</b> · คาดได้รับ (60-90 วัน): <b>{addDaysStr(orderDate, 60) || "?"}</b> ถึง <b>{addDaysStr(orderDate, 90) || "?"}</b>
                        </p>
                        <label className="text-xs text-violet-700">วันคาดรับจริง (กรอกเมื่อรู้กำหนดแน่)
                          <input type="date" value={histEdit.eta} onChange={e => setHistEdit({ ...histEdit, eta: e.target.value })}
                            className="mt-1 w-full border border-violet-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white" />
                        </label>
                        <label className="text-xs text-violet-700">SN จริง (เติมเมื่อรถผลิตเสร็จมาถึง)
                          <input value={histEdit.sn} onChange={e => setHistEdit({ ...histEdit, sn: e.target.value })}
                            placeholder="กรอก SN ที่ติดมากับรถ"
                            className="mt-1 w-full border border-violet-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white" />
                        </label>
                        {eta && left != null && (
                          <p className={`text-xs font-bold ${left < 0 ? "text-red-600" : left <= 14 ? "text-amber-600" : "text-violet-700"}`}>
                            {left < 0 ? `⚠️ เกินกำหนดแล้ว ${-left} วัน — ควรติดตาม` : left === 0 ? "📦 ครบกำหนดวันนี้" : `⏳ อีก ${left} วันถึงกำหนดรับ`}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
                    <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" />แก้ไข (ฝ่ายสต็อก)</p>
                    <label className="text-xs text-slate-500">สถานะ
                      <select value={histEdit.sale_status} onChange={e => setHistEdit({ ...histEdit, sale_status: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800">
                        {/* สถานะให้เลือกชุดเดียว + คงค่าปัจจุบันของดีลไว้ (ถ้าเป็นสถานะเก่า) */}
                        {(SALE_STATUS_OPTIONS.includes(histEdit.sale_status) ? SALE_STATUS_OPTIONS : [histEdit.sale_status, ...SALE_STATUS_OPTIONS]).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-slate-500">วันส่งมอบ
                      <input type="date" value={histEdit.delivery_date} onChange={e => setHistEdit({ ...histEdit, delivery_date: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800" />
                    </label>
                    {/* หมวดลูกค้า (สำหรับคำนวณค่าคอมโฟล์คลิฟท์) — ลูกค้าเก่าระบบตรวจอัตโนมัติจากประวัติ */}
                    <label className="text-xs text-slate-500">หมวดค่าคอม (โฟล์คลิฟท์ — สำหรับหน้าค่าคอม)
                      <select value={histEdit.commCat} onChange={e => setHistEdit({ ...histEdit, commCat: e.target.value })} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800">
                        <option value="">— เลือกหมวดลูกค้า —</option>
                        {COMMISSION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-slate-500">หมายเหตุ
                      <textarea value={histEdit.remark} onChange={e => setHistEdit({ ...histEdit, remark: e.target.value })} rows={2} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800" />
                    </label>
                    <button onClick={saveHistEdit} className="mt-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-sm">บันทึกการแก้ไข</button>
                  </div>

                  {/* ประวัติการแก้ไข (audit log) — ง */}
                  {(histDetail.custom_fields?.["ประวัติแก้ไข"] as string)?.trim() && (
                    <div className="border-t border-slate-100 pt-3">
                      <p className="text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1.5"><History className="w-3.5 h-3.5" />ประวัติการแก้ไข</p>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 flex flex-col gap-1 max-h-32 overflow-y-auto">
                        {(histDetail.custom_fields!["ประวัติแก้ไข"] as string).split("\n").reverse().map((l, i) => (
                          <p key={i} className="text-[11px] text-slate-600 leading-snug">{l}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
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
          ["ชนิดล้อ", cf["ชนิดล้อ"] ?? ""],
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
          ["เติมเข้าสต็อกเมื่อ", fmtAdded(it.created_at)],
        ];
        // ── ข้อมูลการขาย (ดึงจากตารางดีล) — โชว์เมื่อรถมีดีลผูกอยู่ (เช่น ปิดการขายแล้ว) ──
        const saleForItem = [...sales]
          .filter(s => String(s.forklift_id) === String(it.id) || (it.SN && String(s.forklift_unit_no).toUpperCase() === String(it.SN).toUpperCase()))
          .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
        const saleRows: [string, string][] = saleForItem ? [
          ["เซลล์ผู้ขาย", saleForItem.sales_staff ?? ""],
          ["ลูกค้า", saleForItem.customer_name ?? ""],
          ["เบอร์โทร", saleForItem.customer_tel ?? ""],
          ["จังหวัด", saleForItem.province ?? ""],
          ["ประเภทลูกค้า", (saleForItem.customer_type as string) ?? ""],
          ["ราคาขาย", saleForItem.actual_sale ? `฿${Number(saleForItem.actual_sale).toLocaleString()}` : ""],
          ["การชำระ", (saleForItem.payment_type as string) ?? ""],
          ["สถานะดีล", (saleForItem.sale_status as string) ?? ""],
          ["วันที่ปิดการขาย", saleForItem.created_at ?? ""],
          ["เลขที่ใบกำกับ", (saleForItem.custom_fields?.["เลขที่ใบกำกับภาษี"] as string) ?? ""],
        ] : [];
        // custom_fields ที่โชว์ในสเปก/ข้อมูลแล้ว + คีย์ internal → ไม่ต้องโชว์ซ้ำใน "ข้อมูลเพิ่มเติม"
        const SHOWN_CF = new Set(["ประเภทสินค้า","MAST","Valve","ขนาดงา","ชนิดล้อ","เซลล์ผู้ดูแล","รายละเอียด (ลูกค้า)","เลขที่ใบกำกับภาษี","ชีตต้นทาง"]);
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
                {saleForItem && (
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5 text-indigo-500" />ข้อมูลการขาย</p>
                    <div className="grid grid-cols-2 gap-2">
                      {saleRows.filter(([, v]) => String(v ?? "").trim()).map(([k, v]) => (
                        <div key={k} className="bg-indigo-50/50 border border-indigo-100 rounded-xl px-3 py-2">
                          <p className="text-[11px] text-indigo-400">{k}</p>
                          <p className="text-sm font-semibold text-slate-700 break-words">{v}</p>
                        </div>
                      ))}
                    </div>
                    {!String(saleForItem.sales_staff ?? "").trim() && (
                      <p className="text-[11px] text-slate-400 mt-1.5">* ดีลนี้ไม่มีข้อมูลเซลล์ผู้ขาย (นำเข้าจากบิลภาษี)</p>
                    )}
                  </div>
                )}
                {/* สถานที่ที่รถอยู่ — แก้ไขได้ (ทั้งสต็อก/เซลล์ใช้ดูตำแหน่งเพื่อส่งมอบ) */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />สถานที่ที่รถอยู่</p>
                  <div className="flex gap-2">
                    {/* dropdown จริง — โชว์ทุกสาขาเสมอ (สำนักงานใหญ่/ชลบุรี/ขอนแก่น) · รวมค่าปัจจุบันถ้าไม่อยู่ในลิสต์ */}
                    <select value={locEdit} onChange={e => { setLocEdit(e.target.value); setLocSaved(false); }}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer">
                      <option value="">— เลือกสาขา/สถานที่ —</option>
                      {[...new Set([...fieldConfig.locations, ...(locEdit && !fieldConfig.locations.includes(locEdit) ? [locEdit] : [])])].map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <button onClick={() => { const u = { ...it, location: locEdit.trim() }; updateForklift(u); setDetailItem(u); setLocSaved(true); }}
                      disabled={locEdit.trim() === (it.location ?? "").trim()}
                      className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                      {locSaved ? "บันทึกแล้ว ✓" : "บันทึก"}
                    </button>
                  </div>
                </div>
                {/* หมายเหตุ/รายละเอียดการขาย — ราคาขายจริง/ค่าขนส่ง/งาเท/เลขใบกำกับ ฯลฯ (นำเข้าจากไฟล์สต็อก + แก้ได้) */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />หมายเหตุ / รายละเอียดการขาย</p>
                  <textarea value={noteEdit} onChange={e => { setNoteEdit(e.target.value); setNoteSaved(false); }} rows={3}
                    placeholder="เช่น ราคาขายจริง / ค่าขนส่ง+ผู้ให้บริการ / งาเท+ทุนงาเท / เลขใบกำกับ ..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
                  <button onClick={() => { const cf = { ...(it.custom_fields || {}) }; if (noteEdit.trim()) cf["หมายเหตุการขาย"] = noteEdit.trim(); else delete cf["หมายเหตุการขาย"]; const u = { ...it, custom_fields: cf }; updateForklift(u); setDetailItem(u); setNoteSaved(true); }}
                    disabled={noteEdit.trim() === ((it.custom_fields?.["หมายเหตุการขาย"] as string) ?? "").trim()}
                    className="mt-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
                    {noteSaved ? "บันทึกแล้ว ✓" : "บันทึกหมายเหตุ"}
                  </button>
                </div>
                {/* ข้อมูลการขายจริง (จากไฟล์สต็อก) — ราคาขาย/ค่าขนส่ง/ทุนอุปกรณ์ + กำไรจริงคำนวณ (เฟส 3) */}
                {(() => {
                  const cf = (it.custom_fields || {}) as Record<string, unknown>;
                  const sale = Number(cf["ราคาขายจริง"]) || 0, ship = Number(cf["ค่าขนส่งจริง"]) || 0, addon = Number(cf["ทุนอุปกรณ์เสริม"]) || 0;
                  const fp = cf["กำไร(ไฟล์)"];
                  if (!(sale || ship || addon || fp)) return null;
                  const cost = Number(it.cost_price) || 0;
                  const realProfit = sale ? sale - cost - ship - addon : null;
                  const b = (n: unknown) => Number(n).toLocaleString("th-TH");
                  return (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                      <p className="text-xs font-bold text-emerald-700 mb-2">💰 ข้อมูลการขายจริง (จากไฟล์สต็อก)</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700">
                        {sale > 0 && <div><span className="text-slate-400">ราคาขายจริง</span> <b>฿{b(sale)}</b></div>}
                        <div><span className="text-slate-400">ต้นทุน</span> <b>฿{b(cost)}</b></div>
                        {ship > 0 && <div><span className="text-slate-400">ค่าขนส่ง</span> <b>฿{b(ship)}</b></div>}
                        {addon > 0 && <div><span className="text-slate-400">ทุนอุปกรณ์/งาเท</span> <b>฿{b(addon)}</b></div>}
                        {realProfit != null && <div className="col-span-2 pt-1 mt-0.5 border-t border-emerald-100"><span className="text-emerald-600 font-semibold">กำไรจริง (คำนวณ)</span> <b className="text-emerald-700 text-sm">฿{b(realProfit)}</b></div>}
                        {fp != null && <div className="col-span-2 text-[11px] text-slate-400">กำไรที่บันทึกในไฟล์: ฿{b(fp)}</div>}
                      </div>
                    </div>
                  );
                })()}
                {/* แก้ไขข้อมูลการเงิน — เฉพาะวรลักษณ์ · แก้ได้ทุกสถานะ (รวมปิดการขายแล้ว) สำหรับลงข้อมูลย้อนหลัง */}
                {canEditFinance && (() => {
                  const inp = "w-full mt-0.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400";
                  const cf = (it.custom_fields ?? {}) as Record<string, unknown>;
                  const dirty = finEdit.cost !== (it.cost_price ? String(it.cost_price) : "")
                    || finEdit.sale !== (cf["ราคาขายจริง"] != null ? String(cf["ราคาขายจริง"]) : "")
                    || finEdit.ship !== (cf["ค่าขนส่งจริง"] != null ? String(cf["ค่าขนส่งจริง"]) : "")
                    || finEdit.addon !== (cf["ทุนอุปกรณ์เสริม"] != null ? String(cf["ทุนอุปกรณ์เสริม"]) : "")
                    || finEdit.profit !== (cf["กำไร(ไฟล์)"] != null ? String(cf["กำไร(ไฟล์)"]) : "");
                  return (
                    <div className="border border-violet-200 bg-violet-50/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-violet-700 mb-2 flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" />แก้ไขข้อมูลการเงิน (วรลักษณ์) · แก้ได้ทุกสถานะ</p>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[11px] text-slate-500">ต้นทุน (บาท)
                          <input type="number" value={finEdit.cost} onChange={e => { setFinEdit({ ...finEdit, cost: e.target.value }); setFinSaved(false); }} className={inp} /></label>
                        <label className="text-[11px] text-slate-500">ราคาขายจริง (บาท)
                          <input type="number" value={finEdit.sale} onChange={e => { setFinEdit({ ...finEdit, sale: e.target.value }); setFinSaved(false); }} className={inp} /></label>
                        <label className="text-[11px] text-slate-500">ค่าขนส่งจริง (บาท)
                          <input type="number" value={finEdit.ship} onChange={e => { setFinEdit({ ...finEdit, ship: e.target.value }); setFinSaved(false); }} className={inp} /></label>
                        <label className="text-[11px] text-slate-500">ทุนอุปกรณ์/งาเท (บาท)
                          <input type="number" value={finEdit.addon} onChange={e => { setFinEdit({ ...finEdit, addon: e.target.value }); setFinSaved(false); }} className={inp} /></label>
                        <label className="text-[11px] text-slate-500 col-span-2">กำไรที่บันทึกในไฟล์ (บาท · ไม่บังคับ)
                          <input type="number" value={finEdit.profit} onChange={e => { setFinEdit({ ...finEdit, profit: e.target.value }); setFinSaved(false); }} className={inp} /></label>
                      </div>
                      <button onClick={() => {
                          const ncf = { ...(it.custom_fields || {}) } as Record<string, string>;
                          const setNum = (k: string, v: string) => { const t = v.trim(); if (t !== "" && !isNaN(Number(t))) ncf[k] = String(Number(t)); else delete ncf[k]; };
                          setNum("ราคาขายจริง", finEdit.sale); setNum("ค่าขนส่งจริง", finEdit.ship);
                          setNum("ทุนอุปกรณ์เสริม", finEdit.addon); setNum("กำไร(ไฟล์)", finEdit.profit);
                          const cost = finEdit.cost.trim() === "" ? 0 : (Number(finEdit.cost) || 0);
                          const u = { ...it, cost_price: cost, custom_fields: ncf }; updateForklift(u); setDetailItem(u); setFinSaved(true);
                        }}
                        disabled={!dirty}
                        className="mt-2 px-4 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed">
                        {finSaved ? "บันทึกแล้ว ✓" : "บันทึกข้อมูลการเงิน"}
                      </button>
                      <p className="text-[10px] text-slate-400 mt-1.5">* มีผลกับ &ldquo;กำไรจริง (คำนวณ)&rdquo; + หน้าค่าคอม/วางแผนสั่งสต็อก · บันทึกทุกครั้งจะเข้า audit log</p>
                    </div>
                  );
                })()}
                {/* วันสั่งรถ (สำหรับรถสั่งผลิต) — โชว์บนการ์ดหน้าขายด้วย */}
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />วันสั่งรถ (รถสั่งผลิต)</p>
                  <div className="flex gap-2">
                    <input type="date" value={orderDateEdit} onChange={e => { setOrderDateEdit(e.target.value); setOrderSaved(false); }}
                      className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    <button onClick={() => {
                        const cf = { ...(it.custom_fields ?? {}) } as Record<string, string>;
                        if (orderDateEdit.trim()) cf["วันสั่งรถ"] = orderDateEdit.trim(); else delete cf["วันสั่งรถ"];
                        const u = { ...it, custom_fields: cf }; updateForklift(u); setDetailItem(u); setOrderSaved(true);
                      }}
                      disabled={orderDateEdit.trim() === ((it.custom_fields?.["วันสั่งรถ"] as string) ?? "").trim()}
                      className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
                      {orderSaved ? "บันทึกแล้ว ✓" : "บันทึก"}
                    </button>
                  </div>
                </div>
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

