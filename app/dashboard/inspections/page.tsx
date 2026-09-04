"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useApp } from "@/lib/AppContext";
import { driveImg } from "@/lib/img";
import { mockTransporterData } from "@/lib/mockData";
import { InspectionRecord, DeletedInspectionRecord, Forklift } from "@/lib/types";
import { DashboardGuard } from "@/components/DashboardGuard";
import {
  ArrowLeft, Camera, ImageOff, Calendar, Truck, User,
  Trash2, RotateCcw, AlertTriangle, X, ZoomIn, ChevronLeft, ChevronRight, Info, Download, Search
} from "lucide-react";

function daysLeft(deletedAt: string) {
  const ms = 7 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(deletedAt).getTime());
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function InspectionsPageInner() {
  const { inspections, deletedInspections, deleteInspection, restoreInspection, purgeInspection, forklifts } = useApp();

  const [detail, setDetail]         = useState<InspectionRecord | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [showBin, setShowBin]       = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [purgeConfirm, setPurgeConfirm]   = useState<string | null>(null);

  const [q, setQ] = useState("");

  const openDetail = (rec: InspectionRecord) => { setDetail(rec); setLightboxIdx(null); };
  const closeDetail = () => { setDetail(null); setLightboxIdx(null); };

  // ค้นหาย้อนหลังง่ายๆ: SN/รหัสรถ · รุ่น/ยี่ห้อ · ผู้ขนส่ง · วันที่ · บทบาท (รับ/ส่ง)
  const fkByUnit = useMemo(() => {
    const m = new Map<string, Forklift>();
    forklifts.forEach(f => { if (f.SN) m.set(String(f.SN).toUpperCase(), f); m.set(String(f.id).toUpperCase(), f); });
    return m;
  }, [forklifts]);
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const base = !kw ? inspections : inspections.filter(r => {
      const f = fkByUnit.get(String(r.unit_no ?? "").toUpperCase());
      return [r.unit_no, f?.model, f?.brand, f?.pi_no, r.transporter_name, r.date, r.role, r.delivery_company]
        .some(v => String(v ?? "").toLowerCase().includes(kw));
    });
    // เรียงรับรถล่าสุดอยู่บนสุด — วันที่มากไปน้อย · วันเดียวกันใช้ id (ins_<เวลา>) ตัดสิน
    return [...base].sort((a, b) =>
      String(b.date ?? "").localeCompare(String(a.date ?? "")) || String(b.id ?? "").localeCompare(String(a.id ?? "")));
  }, [inspections, fkByUnit, q]);

  const handleDelete = (id: string) => { deleteInspection(id); setDeleteConfirm(null); if (detail?.id === id) closeDetail(); };
  const handlePurge  = (id: string) => { purgeInspection(id); setPurgeConfirm(null); };

  // ── Export ประวัติรับ-ส่งรถทุกคัน → Excel (สำรองข้อมูล + ส่งต่อตำแหน่งอื่น) · 2 ชีต: สรุปรายคัน + รายเรคคอร์ด + ลิงก์รูป ──
  const exportHistoryExcel = async () => {
    if (inspections.length === 0) return;
    const XLSX = await import("xlsx");
    const fkByKey = new Map<string, Forklift>();
    forklifts.forEach(f => { if (f.SN) fkByKey.set(String(f.SN).toUpperCase(), f); fkByKey.set(String(f.id).toUpperCase(), f); });
    const findFk = (unit?: string) => unit ? (fkByKey.get(String(unit).toUpperCase()) || null) : null;

    const recRows = inspections.map((r, i) => {
      const f = findFk(r.unit_no);
      const slots = (r.image_slots ?? {}) as Record<string, string>;
      const slotUrl = (k: string) => slots[k] ? driveImg(slots[k]) : "";
      const slotVals = new Set(Object.values(slots).filter(Boolean));
      const extras = (r.images ?? []).filter(u => !slotVals.has(u)).map(driveImg);
      return {
        "ลำดับ": i + 1, "วันที่": r.date ?? "", "บทบาท": r.role ?? "ผู้รับรถ",
        "รหัสรถ": f?.id ?? "", "SN": r.unit_no ?? "", "ยี่ห้อ": f?.brand ?? "", "รุ่น": f?.model ?? "",
        "สถานะรถ": f?.status ?? "", "PI": f?.pi_no ?? "", "ผู้ขนส่ง": r.transporter_name ?? "", "เบอร์": r.transporter_phone ?? "",
        "บริษัทที่ไปส่ง": r.delivery_company ?? "", "ลิงก์โลเคชั่น": r.location_link ?? "", "จำนวนรูป": (r.images ?? []).length,
        "รูป Name Plate": slotUrl("name_plate"), "รูปเอกสาร PI": slotUrl("pi_doc"), "รูปรถด้านหน้า": slotUrl("front"),
        "รูปรถด้านหลัง": slotUrl("back"), "รูปรถด้านซ้าย": slotUrl("left"), "รูปรถด้านขวา": slotUrl("right"),
        "รูปกล่องเครื่องมือ": slotUrl("toolbox"), "รูปตู้ชาร์จ": slotUrl("charger"),
        "รูปเพิ่มเติม (ลิงก์)": extras.join("\n"),
      };
    });
    const ws1 = XLSX.utils.json_to_sheet(recRows);
    ws1["!cols"] = [6, 12, 12, 16, 16, 12, 18, 14, 10, 16, 12, 20, 26, 8, 30, 30, 30, 30, 30, 30, 30, 30, 42].map(w => ({ wch: w }));

    const byCar = new Map<string, { f: Forklift | null; unit: string; recv: InspectionRecord[]; send: InspectionRecord[] }>();
    inspections.forEach(r => {
      const key = String(r.unit_no ?? "").toUpperCase();
      if (!key) return;
      if (!byCar.has(key)) byCar.set(key, { f: findFk(r.unit_no), unit: r.unit_no, recv: [], send: [] });
      const g = byCar.get(key)!;
      ((r.role ?? "ผู้รับรถ") === "ผู้รับรถ" ? g.recv : g.send).push(r);
    });
    const latest = (arr: InspectionRecord[]) => [...arr].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")))[0];
    const carRows = [...byCar.values()].map(g => {
      const lr = latest(g.recv), ls = latest(g.send);
      return {
        "รหัสรถ": g.f?.id ?? "", "SN": g.unit, "ยี่ห้อ": g.f?.brand ?? "", "รุ่น": g.f?.model ?? "", "สถานะรถ": g.f?.status ?? "", "PI": g.f?.pi_no ?? "",
        "ครั้งที่รับ": g.recv.length, "ครั้งที่ส่ง": g.send.length, "วันรับล่าสุด": lr?.date ?? "", "วันส่งล่าสุด": ls?.date ?? "",
        "บริษัทปลายทางล่าสุด": ls?.delivery_company ?? "", "รวมรูปทั้งหมด": [...g.recv, ...g.send].reduce((s, r) => s + (r.images?.length ?? 0), 0),
      };
    }).sort((a, b) => String(a["ยี่ห้อ"]).localeCompare(String(b["ยี่ห้อ"])) || String(a["รุ่น"]).localeCompare(String(b["รุ่น"])));
    const ws2 = XLSX.utils.json_to_sheet(carRows);
    ws2["!cols"] = [16, 16, 12, 18, 14, 10, 10, 10, 14, 14, 26, 12].map(w => ({ wch: w }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws2, "สรุปรายคัน");
    XLSX.utils.book_append_sheet(wb, ws1, "ประวัติรับ-ส่งรถ");
    XLSX.writeFile(wb, `ประวัติรับ-ส่งรถ_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all duration-200">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-indigo-500 to-blue-700 rounded-xl p-2">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">แกลเลอรีตรวจรับรถ</h1>
                <p className="text-slate-500 text-xs">คลิกการ์ดเพื่อดูรายละเอียด</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportHistoryExcel}
              disabled={inspections.length === 0}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="ส่งออกประวัติรถทุกคันเป็น Excel"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              onClick={() => setShowBin(!showBin)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-200 ${showBin ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              ถังขยะ {deletedInspections.length > 0 && `(${deletedInspections.length})`}
            </button>
            <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full">
              {inspections.length} รายการ
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* ── ค้นหาย้อนหลัง ── */}
        {inspections.length > 0 && (
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="ค้นหา SN / รุ่น / PI / ผู้ขนส่ง / วันที่..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            {q && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{filtered.length} รายการ</span>}
          </div>
        )}
        {/* ── Active Inspections Grid ── */}
        {inspections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="bg-slate-100 rounded-2xl p-6 mb-4"><Camera className="w-12 h-12 text-slate-300" /></div>
            <p className="font-semibold text-slate-500 text-lg">ยังไม่มีรูปตรวจรับ</p>
            <p className="text-sm mt-1">เมื่อผู้ขนส่งบันทึกการรับมอบรถ รายการจะแสดงที่นี่</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">ไม่พบรายการที่ตรงกับ &ldquo;{q}&rdquo;</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((rec) => (
              <InspectionCard
                key={rec.id}
                rec={rec}
                fk={fkByUnit.get(String(rec.unit_no ?? "").toUpperCase())}
                onOpen={() => openDetail(rec)}
                onDelete={() => setDeleteConfirm(rec.id)}
                deleteConfirm={deleteConfirm === rec.id}
                onDeleteConfirm={() => handleDelete(rec.id)}
                onDeleteCancel={() => setDeleteConfirm(null)}
              />
            ))}
          </div>
        )}

        {/* ── Recycle Bin ── */}
        {showBin && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
            <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-500" />
              <h3 className="font-bold text-red-700 text-sm">ถังขยะ — รายการที่ถูกลบ</h3>
              <span className="ml-auto text-xs text-red-500">ลบอัตโนมัติหลัง 7 วัน</span>
            </div>
            {deletedInspections.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">ถังขยะว่างเปล่า</div>
            ) : (
              <div className="p-4 flex flex-col gap-2">
                {deletedInspections.map((rec) => (
                  <div key={rec.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                    <div className="bg-red-100 rounded-xl p-2 flex-shrink-0">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700 text-sm">{rec.unit_no}</p>
                      <p className="text-xs text-slate-500">{rec.transporter_name} · {rec.date}</p>
                      <p className={`text-xs mt-0.5 font-medium ${daysLeft(rec.deletedAt) <= 1 ? "text-red-600" : "text-amber-600"}`}>
                        เหลือ {daysLeft(rec.deletedAt)} วันก่อนลบถาวร
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => restoreInspection(rec.id)}
                        className="flex items-center gap-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />กู้คืน
                      </button>
                      {purgeConfirm === rec.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => handlePurge(rec.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors">ลบถาวร</button>
                          <button onClick={() => setPurgeConfirm(null)} className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1.5 rounded-lg">ยกเลิก</button>
                        </div>
                      ) : (
                        <button onClick={() => setPurgeConfirm(rec.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Detail Modal ── */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && closeDetail()}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-blue-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">{detail.unit_no}</h2>
                <p className="text-indigo-200 text-sm">{detail.transporter_name} · {detail.date}</p>
              </div>
              <button onClick={closeDetail} className="text-white/70 hover:text-white hover:bg-white/20 rounded-xl p-2 transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Specs */}
              {(() => {
                const specs = mockTransporterData[detail.unit_no];
                return specs ? (
                  <div className="px-6 pt-5 pb-4 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5" />ข้อมูลรถ
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {[
                        ["ยี่ห้อ", specs.brand],
                        ["รุ่น", specs.model],
                        ["พิกัดยก", specs.capacity],
                        ["เชื้อเพลิง", specs.fuel],
                        ["สีรถ", specs.color],
                      ].map(([label, value]) => (
                        <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                          <p className="text-xs text-slate-500 mb-1">{label}</p>
                          {label === "สีรถ" ? (
                            <div className="flex items-center gap-2">
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-200 flex-shrink-0" style={{ backgroundColor: value }} />
                              <span className="text-sm font-bold text-slate-800">{value}</span>
                            </div>
                          ) : (
                            <p className="text-sm font-bold text-slate-800">{value}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-6 pt-4 pb-3 border-b border-slate-100">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-700">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      ไม่พบข้อมูลสเปคสำหรับ {detail.unit_no}
                    </div>
                  </div>
                );
              })()}

              {/* Images */}
              <div className="px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />รูปภาพ ({detail.images.length} รูป)
                  </p>
                </div>
                {detail.images.length === 0 ? (
                  <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl py-10 flex flex-col items-center gap-2 text-slate-400">
                    <ImageOff className="w-8 h-8 text-slate-300" />
                    <p className="text-sm">ไม่มีรูปภาพในรายการนี้</p>
                    <p className="text-xs text-slate-400">รูปภาพจะหายหลังรีเฟรชหน้าเว็บ (เก็บเฉพาะ session)</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {detail.images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxIdx(i)}
                        className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group hover:ring-2 hover:ring-indigo-400 transition-all"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={driveImg(img)} alt={`รูป ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <span className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">{i + 1}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer with delete */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0 bg-slate-50">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                <span>รับมอบวันที่ {detail.date}</span>
              </div>
              {deleteConfirm === detail.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">ยืนยันลบ?</span>
                  <button onClick={() => handleDelete(detail.id)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
                    ลบ → ถังขยะ
                  </button>
                  <button onClick={() => setDeleteConfirm(null)} className="bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg">ยกเลิก</button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(detail.id)}
                  className="flex items-center gap-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />ลบรายการ
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {detail && lightboxIdx !== null && detail.images.length > 0 && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setLightboxIdx(null)}>
          <button onClick={() => setLightboxIdx(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 rounded-full p-2">
            <X className="w-6 h-6" />
          </button>
          {/* prev */}
          {lightboxIdx > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-all">
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {/* image */}
          <div className="max-w-3xl max-h-[80vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={driveImg(detail.images[lightboxIdx])} alt={`รูป ${lightboxIdx + 1}`} className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" />
          </div>
          {/* next */}
          {lightboxIdx < detail.images.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-white/10 hover:bg-white/20 rounded-full p-3 transition-all">
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
            {lightboxIdx + 1} / {detail.images.length}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Inspection Card Component ──────────────────────────────────────────────────
function InspectionCard({
  rec, fk, onOpen, onDelete, deleteConfirm, onDeleteConfirm, onDeleteCancel
}: {
  rec: InspectionRecord;
  fk?: Forklift;   // รถจริงจากสต็อก (เอา PI/ยี่ห้อ/รุ่นจริงมาโชว์)
  onOpen: () => void;
  onDelete: () => void;
  deleteConfirm: boolean;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}) {
  const specs = mockTransporterData[rec.unit_no];
  const brand = fk?.brand ?? specs?.brand;
  const model = fk?.model ?? specs?.model;
  const pi = fk?.pi_no;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow duration-200 group">
      {/* Thumbnail area — clickable */}
      <button onClick={onOpen} className="w-full text-left">
        {rec.images.length > 0 ? (
          <div className="grid grid-cols-3 gap-0.5 bg-slate-100 aspect-[3/1.8] overflow-hidden">
            {rec.images.slice(0, 3).map((img, i) => (
              <div key={i} className="relative overflow-hidden bg-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={driveImg(img)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                {i === 2 && rec.images.length > 3 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-sm font-bold">+{rec.images.length - 3}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gradient-to-br from-slate-100 to-slate-50 h-28 flex flex-col items-center justify-center gap-1.5 border-b border-slate-100 group-hover:from-indigo-50 group-hover:to-slate-50 transition-colors">
            <Camera className="w-7 h-7 text-slate-300 group-hover:text-indigo-300 transition-colors" />
            <span className="text-xs text-slate-400">แตะเพื่อดูรายละเอียด</span>
          </div>
        )}
      </button>

      <div className="p-4 flex flex-col gap-2">
        {/* Unit + specs line */}
        <button onClick={onOpen} className="text-left">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="bg-amber-100 rounded-lg p-1"><Truck className="w-3.5 h-3.5 text-amber-600" /></div>
                <span className="font-bold text-slate-800">{rec.unit_no}</span>
                {pi && <span className="text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.5 rounded-full">PI {pi}</span>}
              </div>
              {(brand || model) && <p className="text-xs text-slate-500 mt-1">{brand} {model}{specs?.capacity ? ` · ${specs.capacity}` : ""}</p>}
            </div>
            <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full flex-shrink-0">
              {rec.images.length} รูป
            </span>
          </div>
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><User className="w-3 h-3" />{rec.transporter_name}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{rec.date}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-1">
          <button onClick={onOpen}
            className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold py-1.5 rounded-lg transition-colors">
            ดูรายละเอียด
          </button>
          {deleteConfirm ? (
            <div className="flex gap-1">
              <button onClick={onDeleteConfirm} className="bg-red-600 text-white text-xs font-bold px-2 py-1.5 rounded-lg">ยืนยัน</button>
              <button onClick={onDeleteCancel} className="bg-slate-200 text-slate-700 text-xs px-2 py-1.5 rounded-lg">ยกเลิก</button>
            </div>
          ) : (
            <button onClick={onDelete} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InspectionsPage() {
  return <DashboardGuard><InspectionsPageInner /></DashboardGuard>;
}
