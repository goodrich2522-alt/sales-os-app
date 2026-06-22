"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, CheckCircle, Truck, Camera, AlertCircle, LogOut, ChevronRight, ChevronLeft, Package, History, ImageOff, Hash, Calendar, User, FileText, PackageCheck, Clock, Search, RotateCcw, Building2, Briefcase, Trash2 } from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { Forklift, Sale } from "@/lib/types";
import { driveImg } from "@/lib/img";

type TransporterRole = "ผู้รับรถ" | "ผู้ส่งมอบรถ";

// วันที่ ISO (2026-01-07) → ข้อความไทย "7 ม.ค. 2569" — กัน Google Sheets แปลงเป็นวันที่ผิด + อ่านง่าย
const TH_MON = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function thaiDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  return `${+m[3]} ${TH_MON[+m[2]]} ${+m[1] + 543}`;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function TransporterMain() {
  const router = useRouter();
  const { addInspection, deleteInspection, updateForklift, deleteForklift, forklifts, sales, inspections } = useApp();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<TransporterRole>("ผู้รับรถ");
  const [showHistory, setShowHistory] = useState(false);
  const [histSearch, setHistSearch] = useState("");
  const [histDeleteId, setHistDeleteId] = useState<string | null>(null); // ยืนยันก่อนลบรายการประวัติ
  const [lightbox, setLightbox] = useState<{ imgs: string[]; idx: number } | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── ฟอร์มผู้รับรถ ──
  const [piNo, setPiNo] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [unitNo, setUnitNo] = useState("");           // SN
  const [pickedModel, setPickedModel] = useState(""); // เลือก "รุ่น" เมื่อ PI มีหลายรุ่น

  // ── ฟอร์มผู้ส่งรถ ──
  const [delCustomer, setDelCustomer] = useState("");  // ค้นหาด้วยชื่อบริษัทลูกค้า
  const [pickedSaleId, setPickedSaleId] = useState<string | null>(null);
  const [senderName, setSenderName] = useState("");
  const [deliverDate, setDeliverDate] = useState("");
  const [salesOwner, setSalesOwner] = useState("");

  // ── สถานะหลังบันทึก (เพื่อยกเลิกรายการล่าสุด) ──
  const [done, setDone] = useState<null | { insId: string; before: Forklift | null; label: string }>(null);

  useEffect(() => {
    const name = localStorage.getItem("transporter_name");
    if (!name) { router.push("/transporter/login"); return; }
    setUsername(name); setReceiverName(name); setSenderName(name);
  }, [router]);

  const isReceiver = role === "ผู้รับรถ";

  // ===== ผู้รับรถ: ระบบหาคันเอง =====
  const waitingList = forklifts.filter(f => String(f.status || "") === "รอรับ");
  const snKey = unitNo.trim().toUpperCase();
  const piKey = piNo.trim().toUpperCase();
  const stockMatch = snKey ? (forklifts.find(f => f.unit_no && String(f.unit_no).toUpperCase() === snKey) || null) : null;
  const waitingByPI = (!stockMatch && piKey) ? waitingList.filter(w => String(w.pi_no || "").trim().toUpperCase() === piKey) : [];
  // จัดกลุ่มตามรุ่นภายใน PI — รุ่นเดียว = ใส่ SN ให้คันแรกเลย / หลายรุ่น = ให้เลือกรุ่นก่อน
  const waitingModels = [...new Set(waitingByPI.map(w => String(w.model || "").trim()))];
  const needPickModel = waitingModels.length > 1;
  const recvTarget: Forklift | null = stockMatch
    ? stockMatch
    : waitingByPI.length === 0 ? null
    : !needPickModel ? waitingByPI[0]                                              // รุ่นเดียว → คันแรก (FIFO)
    : (waitingByPI.find(w => String(w.model || "").trim() === pickedModel) || null); // หลายรุ่น → คันแรกของรุ่นที่เลือก
  const recvMode: "stock" | "waiting" | null = stockMatch ? "stock" : (recvTarget ? "waiting" : null);
  const receiverValid = !!(piKey && receivedDate && receiverName.trim() && snKey && recvTarget);

  // ===== ผู้ส่งรถ: ค้นหาดีลที่ขายแล้ว =====
  const matchingSales: Sale[] = delCustomer.trim()
    ? sales.filter(s => String(s.customer_name || "").toLowerCase().includes(delCustomer.trim().toLowerCase())).slice(0, 12)
    : [];
  const pickedSale = pickedSaleId ? sales.find(s => s.id === pickedSaleId) || null : null;
  const delValid = !!(pickedSale && senderName.trim() && deliverDate);

  const targetReady = isReceiver ? !!recvTarget : !!pickedSale;

  // ===== รูป =====
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (!ev.target?.result) return;
        const img = new Image();
        img.onload = () => {
          const MAX = 800;
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          setImages((prev) => [...prev, canvas.toDataURL("image/jpeg", 0.72)]);
        };
        img.src = ev.target.result as string;
      };
      reader.readAsDataURL(file);
    });
  };
  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  // ===== บันทึก =====
  const submitReceiver = () => {
    if (!recvTarget) return;
    const insId = `ins_${Date.now()}`;
    const rd = thaiDate(receivedDate);
    addInspection({ id: insId, unit_no: snKey, transporter_name: receiverName.trim() || username, date: receivedDate || today(), images: [...images], role: "ผู้รับรถ" });
    const before = { ...recvTarget };
    // รับรถ = รถมาถึงพร้อมขาย → ตั้ง "พร้อมขาย" เสมอ (ทั้งรถรอรับและรถสต็อก) → ขึ้นหน้าเซลล์
    updateForklift({
      ...recvTarget,
      unit_no: recvMode === "waiting" ? snKey : recvTarget.unit_no,
      pi_no: piNo.trim() || recvTarget.pi_no,
      received_date: rd || recvTarget.received_date,
      status: "พร้อมขาย",
    });
    setDone({ insId, before, label: `รับรถ ${snKey} แล้ว → เข้าหน้าขาย (พร้อมขาย)` });
  };

  const submitDeliverer = () => {
    if (!pickedSale) return;
    const insId = `ins_${Date.now()}`;
    addInspection({ id: insId, unit_no: pickedSale.forklift_unit_no, transporter_name: senderName.trim() || username, date: deliverDate || today(), images: [...images], role: "ผู้ส่งมอบรถ" });
    setDone({ insId, before: null, label: `ส่งมอบ ${pickedSale.forklift_unit_no} แล้ว` });
  };

  // ยกเลิกรายการล่าสุด — ลบ inspection + คืนรถกลับสถานะก่อนรับ (รถรอรับ → กลับเป็น "รอรับ" ไม่ลบทิ้ง)
  const undoLast = () => {
    if (!done) return;
    deleteInspection(done.insId);
    if (done.before) updateForklift(done.before); // revert: รอรับ→รอรับ / สต็อกเดิม→ค่าเดิม
    resetForm();
  };

  // ลบรายการในประวัติ — ลบ inspection + (ถ้าเป็นรายการรับรถ) เอารถออกจากสต็อกด้วย
  const deleteHistory = (rec: { id: string; unit_no: string; role?: string }) => {
    deleteInspection(rec.id);
    if ((rec.role ?? "ผู้รับรถ") === "ผู้รับรถ") {
      const f = forklifts.find(x => String(x.unit_no).toUpperCase() === String(rec.unit_no).toUpperCase());
      if (f) deleteForklift(f.id);
    }
    setHistDeleteId(null);
  };

  const resetForm = () => {
    setImages([]); setDone(null);
    setPiNo(""); setReceivedDate(""); setUnitNo(""); setPickedModel("");
    setReceiverName(username);
    setDelCustomer(""); setPickedSaleId(null); setSenderName(username); setDeliverDate(""); setSalesOwner("");
  };

  const switchRole = (r: TransporterRole) => { setRole(r); resetForm(); };
  const handleLogout = () => { localStorage.removeItem("transporter_name"); router.push("/transporter/login"); };

  const histFiltered = [...inspections]
    .filter(r => {
      const q = histSearch.trim().toLowerCase();
      return !q || String(r.unit_no ?? "").toLowerCase().includes(q) || String(r.transporter_name ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")) || String(b.id ?? "").localeCompare(String(a.id ?? "")));

  const inp = "w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2 ${isReceiver ? "bg-gradient-to-br from-yellow-400 to-amber-500" : "bg-gradient-to-br from-blue-500 to-indigo-600"}`}>
              {isReceiver ? <Truck className="w-5 h-5 text-slate-900" /> : <Package className="w-5 h-5 text-white" />}
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">ผู้ขนส่ง</p>
              <p className="text-slate-500 text-xs">{username}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowHistory(true)}
              className="flex items-center gap-1.5 text-slate-600 hover:text-amber-700 text-sm font-medium transition-colors duration-200 hover:bg-amber-50 px-3 py-1.5 rounded-lg">
              <History className="w-4 h-4" /><span className="hidden sm:inline">ประวัติ</span> ({inspections.length})
            </button>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 text-sm font-medium transition-colors duration-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Role Selector */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <p className="text-sm font-bold text-slate-700 mb-3">คุณเป็นผู้ใด?</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => switchRole("ผู้รับรถ")}
              className={`flex flex-col items-center gap-2.5 rounded-2xl p-4 border-2 transition-all ${role === "ผู้รับรถ" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-slate-50 hover:border-amber-200 hover:bg-amber-50/40"}`}>
              <div className={`rounded-xl p-3 ${role === "ผู้รับรถ" ? "bg-amber-400" : "bg-slate-200"}`}>
                <Truck className={`w-6 h-6 ${role === "ผู้รับรถ" ? "text-slate-900" : "text-slate-500"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${role === "ผู้รับรถ" ? "text-amber-700" : "text-slate-600"}`}>ผู้รับรถ</p>
                <p className="text-xs text-slate-400 mt-0.5">รับมอบรถจากต้นทาง</p>
              </div>
              {role === "ผู้รับรถ" && <span className="text-xs bg-amber-500 text-white font-bold px-2.5 py-0.5 rounded-full">เลือกอยู่</span>}
            </button>
            <button onClick={() => switchRole("ผู้ส่งมอบรถ")}
              className={`flex flex-col items-center gap-2.5 rounded-2xl p-4 border-2 transition-all ${role === "ผู้ส่งมอบรถ" ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50 hover:border-indigo-200 hover:bg-indigo-50/40"}`}>
              <div className={`rounded-xl p-3 ${role === "ผู้ส่งมอบรถ" ? "bg-indigo-500" : "bg-slate-200"}`}>
                <Package className={`w-6 h-6 ${role === "ผู้ส่งมอบรถ" ? "text-white" : "text-slate-500"}`} />
              </div>
              <div className="text-center">
                <p className={`text-sm font-bold ${role === "ผู้ส่งมอบรถ" ? "text-indigo-700" : "text-slate-600"}`}>ผู้ส่งมอบรถ</p>
                <p className="text-xs text-slate-400 mt-0.5">ส่งมอบรถให้ลูกค้า</p>
              </div>
              {role === "ผู้ส่งมอบรถ" && <span className="text-xs bg-indigo-500 text-white font-bold px-2.5 py-0.5 rounded-full">เลือกอยู่</span>}
            </button>
          </div>
        </div>

        {/* ============ บันทึกสำเร็จ + ยกเลิกได้ ============ */}
        {done ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-emerald-100 rounded-xl p-2.5 flex-shrink-0"><CheckCircle className="w-7 h-7 text-emerald-600" /></div>
              <div>
                <p className="font-bold text-emerald-800">บันทึกเรียบร้อย! ({role})</p>
                <p className="text-sm text-emerald-600 mt-0.5">{done.label}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={undoLast}
                className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 font-semibold py-3 rounded-xl transition-all">
                <RotateCcw className="w-4 h-4" />ยกเลิกรายการนี้
              </button>
              <button onClick={resetForm}
                className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold py-3 rounded-xl transition-all">
                ทำรายการต่อไป <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : isReceiver ? (
          /* ============ ผู้รับรถ ============ */
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2"><FileText className="w-4 h-4 text-amber-500" />ข้อมูลการรับรถ</h2>
              <p className="text-xs text-slate-500 mb-4">กรอก PI กับ SN ระบบจะหาให้เองว่าเป็นรถคันไหน แล้วเลื่อนลงไปถ่ายรูป</p>
              <div className="flex flex-col gap-3.5">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Hash className="w-3.5 h-3.5 text-amber-500" />เลข PI</label>
                  <input value={piNo} onChange={e => { setPiNo(e.target.value); setPickedModel(""); }} placeholder="เช่น PI017" className={inp} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Hash className="w-3.5 h-3.5 text-amber-500" />SN (ซีเรียลรถ)</label>
                  <input value={unitNo} onChange={e => setUnitNo(e.target.value)} placeholder="เช่น 010503T1726" className={inp} />
                </div>

                {/* ผลการหาคัน */}
                {(snKey || piKey) && (
                  recvMode === "stock" ? (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                      <PackageCheck className="w-4 h-4 flex-shrink-0" />
                      <span className="text-xs font-medium">พบรถในสต็อก: <span className="font-bold">{recvTarget!.brand} {recvTarget!.model}</span> — เติม PI/วันรับให้ และเชื่อมไปหน้าขาย</span>
                    </div>
                  ) : needPickModel ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />PI {piKey} มีหลายรุ่น — แตะเลือกรุ่นที่รับ</p>
                      <div className="flex flex-col gap-1.5">
                        {waitingModels.map(m => {
                          const cnt = waitingByPI.filter(w => String(w.model || "").trim() === m).length;
                          const sel = pickedModel === m;
                          return (
                            <button key={m} onClick={() => setPickedModel(m)}
                              className={`text-left rounded-lg border-2 px-3 py-2 transition-all flex items-center justify-between ${sel ? "border-amber-400 bg-white" : "border-slate-200 bg-white hover:border-amber-200"}`}>
                              <span><span className="text-sm font-bold text-slate-800">{m || "—"}</span><span className="text-xs text-slate-500"> · รอรับ {cnt} คัน</span></span>
                              {sel && <CheckCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                      {pickedModel && <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1"><PackageCheck className="w-3.5 h-3.5" />เลือก {pickedModel} — ยืนยันแล้วเข้าหน้าขายทันที</p>}
                    </div>
                  ) : recvMode === "waiting" ? (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                      <PackageCheck className="w-4 h-4 flex-shrink-0" />
                      <span className="text-xs font-medium">รถรอรับ: <span className="font-bold">{recvTarget!.model}</span> — ยืนยันแล้วเปลี่ยนเป็น &quot;พร้อมขาย&quot; ขึ้นหน้าเซลล์</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span className="text-xs">ยังไม่พบรถ — เช็ค PI/SN ให้ตรง (รถสั่งใหม่ต้องมีในระบบสถานะ &quot;รอรับ&quot; ก่อน)</span>
                    </div>
                  )
                )}

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Calendar className="w-3.5 h-3.5 text-amber-500" />วันที่รับรถ</label>
                  <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><User className="w-3.5 h-3.5 text-amber-500" />ชื่อผู้รับรถ</label>
                  <input value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="ชื่อผู้ไปรับรถ" className={inp} />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ============ ผู้ส่งมอบรถ ============ */
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" />ข้อมูลการส่งมอบรถ</h2>
            <p className="text-xs text-slate-500 mb-4">พิมพ์ชื่อลูกค้าเพื่อหาดีลที่จะไปส่ง เลือกคัน แล้วกรอกข้อมูล + ถ่ายรูป</p>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Building2 className="w-3.5 h-3.5 text-indigo-500" />ชื่อบริษัทลูกค้าที่ไปส่ง</label>
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={delCustomer} onChange={e => { setDelCustomer(e.target.value); setPickedSaleId(null); }} placeholder="พิมพ์ชื่อลูกค้า..."
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 hover:border-slate-300 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                </div>
                {/* ผลค้นหาดีล */}
                {delCustomer.trim() && !pickedSale && (
                  <div className="mt-2 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                    {matchingSales.length === 0 && <p className="text-xs text-slate-400 px-1 py-2">ไม่พบดีลของลูกค้านี้</p>}
                    {matchingSales.map(s => (
                      <button key={s.id} onClick={() => { setPickedSaleId(s.id); setSalesOwner(s.sales_staff || ""); }}
                        className="text-left rounded-xl border-2 border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/40 px-3 py-2.5 transition-all">
                        <p className="text-sm font-bold text-slate-800 truncate">{s.customer_name}</p>
                        <p className="text-xs text-slate-500 truncate">{s.forklift_brand} {s.forklift_model} ({s.forklift_unit_no}) · เซลล์ {s.sales_staff || "—"}</p>
                      </button>
                    ))}
                  </div>
                )}
                {pickedSale && (
                  <div className="mt-2 flex items-center justify-between gap-2 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-3.5 py-2.5">
                    <span className="text-xs font-medium min-w-0 truncate">เลือกแล้ว: <span className="font-bold">{pickedSale.customer_name}</span> · {pickedSale.forklift_model} ({pickedSale.forklift_unit_no})</span>
                    <button onClick={() => { setPickedSaleId(null); }} className="text-indigo-400 hover:text-red-500 flex-shrink-0"><X className="w-4 h-4" /></button>
                  </div>
                )}
              </div>

              {pickedSale && (
                <>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><User className="w-3.5 h-3.5 text-indigo-500" />ผู้ส่งรถ</label>
                    <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="ชื่อผู้ไปส่งรถ"
                      className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Calendar className="w-3.5 h-3.5 text-indigo-500" />วันที่ส่งรถ</label>
                    <input type="date" value={deliverDate} onChange={e => setDeliverDate(e.target.value)}
                      className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"><Briefcase className="w-3.5 h-3.5 text-indigo-500" />เซลล์เจ้าของงาน</label>
                    <input value={salesOwner} onChange={e => setSalesOwner(e.target.value)} placeholder="เซลล์เจ้าของดีล"
                      className="w-full border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ============ ถ่ายรูป (ทั้ง 2 โหมด เมื่อหาคันเจอแล้ว) ============ */}
        {!done && targetReady && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Camera className={`w-4 h-4 ${isReceiver ? "text-amber-500" : "text-indigo-500"}`} />ถ่ายรูปสภาพรถ
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isReceiver ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>{role}</span>
              </h3>
              {images.length > 0 && <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2.5 py-1 rounded-full">{images.length} รูป</span>}
            </div>
            <p className="text-xs text-slate-500 mb-4">{isReceiver ? "ถ่ายรูปสภาพรถทุกมุมก่อนรับมอบ" : "ถ่ายรูปสภาพรถทุกมุมก่อนส่งมอบให้ลูกค้า"} — รูปจะโชว์ในประวัติการขายของรถคันนี้</p>
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/50 rounded-xl p-6 flex flex-col items-center gap-2 transition-all duration-200 cursor-pointer group">
              <div className="bg-white border border-slate-200 group-hover:border-indigo-200 rounded-xl p-2.5 shadow-sm group-hover:shadow-md transition-all duration-200">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <span className="text-sm text-slate-600 group-hover:text-indigo-600 font-medium transition-colors">แตะเพื่อเลือกรูป</span>
              <span className="text-xs text-slate-400">รองรับ JPG, PNG, HEIC</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-4">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`รูปที่ ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <button onClick={() => removeImage(idx)} className="absolute top-1.5 right-1.5 bg-slate-900/70 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors duration-200 opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                    <div className={`absolute bottom-1 left-1 text-xs rounded px-1.5 py-0.5 font-semibold ${isReceiver ? "bg-amber-500/90 text-white" : "bg-indigo-500/90 text-white"}`}>{idx + 1}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============ ปุ่มยืนยัน ============ */}
        {!done && targetReady && (
          <div className="flex flex-col gap-2">
            {isReceiver && !receiverValid && (
              <p className="text-xs text-amber-600 text-center flex items-center justify-center gap-1"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> กรอก PI · SN · วันที่รับรถ · ชื่อผู้รับรถ ให้ครบ</p>
            )}
            {!isReceiver && !delValid && (
              <p className="text-xs text-amber-600 text-center flex items-center justify-center gap-1"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> กรอก ผู้ส่งรถ · วันที่ส่งรถ ให้ครบ</p>
            )}
            <button onClick={isReceiver ? submitReceiver : submitDeliverer} disabled={isReceiver ? !receiverValid : !delValid}
              className={`w-full text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] text-base shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md disabled:active:scale-100 ${isReceiver ? "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500" : "bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500"}`}>
              <CheckCircle className="w-5 h-5" />{isReceiver ? "ยืนยันรับมอบรถ" : "ยืนยันส่งมอบรถ"}<ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>

      {/* ── History Modal ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowHistory(false)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-800">ประวัติรับ-ส่งรถ</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{histFiltered.length} รายการ</p>
                </div>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
              </div>
              <input value={histSearch} onChange={e => setHistSearch(e.target.value)} placeholder="ค้นหา หมายเลขรถ / ชื่อผู้ขนส่ง..."
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-slate-800 placeholder:text-slate-400" />
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2.5">
              {histFiltered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-slate-400"><History className="w-10 h-10 text-slate-300 mb-2" /><p className="text-sm">ยังไม่มีประวัติ</p></div>
              )}
              {histFiltered.map(rec => {
                const receiver = (rec.role ?? "ผู้รับรถ") === "ผู้รับรถ";
                return (
                  <div key={rec.id} className="border border-slate-100 rounded-2xl p-3.5 bg-slate-50/60">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${receiver ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>{rec.role ?? "ผู้รับรถ"}</span>
                        <span className="font-bold text-slate-800 text-sm truncate">{rec.unit_no}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">{rec.date}</span>
                        <button onClick={() => setHistDeleteId(rec.id)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-all" title="ลบรายการนี้"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">โดย <span className="font-semibold text-slate-700">{rec.transporter_name || "—"}</span></p>
                    {histDeleteId === rec.id && (
                      <div className="flex items-center gap-2 mb-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                        <span className="text-xs text-red-700 flex-1">ลบรายการนี้ถาวร?{receiver ? ` + เอารถ ${rec.unit_no} ออกจากสต็อกด้วย` : ""}</span>
                        <button onClick={() => deleteHistory(rec)} className="text-xs font-bold bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg">ลบเลย</button>
                        <button onClick={() => setHistDeleteId(null)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5">ยกเลิก</button>
                      </div>
                    )}
                    {rec.images && rec.images.length > 0 ? (
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {rec.images.map((img, i) => (
                          <button key={i} onClick={() => setLightbox({ imgs: rec.images, idx: i })}
                            className="relative aspect-square rounded-lg overflow-hidden bg-slate-200 hover:ring-2 hover:ring-amber-400 transition-all">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={driveImg(img)} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 flex items-center gap-1"><ImageOff className="w-3.5 h-3.5" />ไม่มีรูป</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all"><X className="w-6 h-6" /></button>
          {lightbox.imgs.length > 1 && (
            <button onClick={e => { e.stopPropagation(); setLightbox(l => l ? { ...l, idx: (l.idx - 1 + l.imgs.length) % l.imgs.length } : l); }}
              className="absolute left-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all"><ChevronLeft className="w-6 h-6" /></button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={driveImg(lightbox.imgs[lightbox.idx])} alt="" className="max-h-[85vh] max-w-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
          {lightbox.imgs.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setLightbox(l => l ? { ...l, idx: (l.idx + 1) % l.imgs.length } : l); }}
                className="absolute right-3 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all"><ChevronRight className="w-6 h-6" /></button>
              <span className="absolute bottom-4 text-white/80 text-sm bg-white/10 px-3 py-1 rounded-full">{lightbox.idx + 1} / {lightbox.imgs.length}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
