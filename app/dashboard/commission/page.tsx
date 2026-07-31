"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  ArrowLeft, DollarSign, Download, ChevronDown, ChevronRight,
  User, AlertCircle, Award, Calendar,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import { Sale } from "@/lib/types";
import {
  calcCommission, isClosedSale, isImportedSale, closeMonth, closeDate,
  COMMISSION_FIELD, COMMISSION_CATEGORIES,
} from "@/lib/commission";

const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH");
const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MONTHS_TH[Number(m) - 1] ?? m} ${Number(y) + 543}`; };

export default function CommissionPage() {
  const { sales, forklifts, updateSale } = useApp();
  const fkById = useMemo(() => new Map(forklifts.map(f => [f.id, f])), [forklifts]);

  // ประวัติซื้อทั้งหมด (รวมบิล GR) — ใช้ตรวจ "ลูกค้าเก่า" (เคยซื้อมาก่อน = ลูกค้าเก่าเสมอ)
  const historySales = useMemo(() => sales.filter(isClosedSale), [sales]);
  // ดีลที่นำมาคิดค่าคอม = ปิดจริง แต่ตัดดีลนำเข้าบิลภาษี GR ออก (ไม่จ่ายค่าคอม)
  const closedSales = useMemo(() => sales.filter(s => isClosedSale(s) && !isImportedSale(s)), [sales]);

  // เดือนที่มีดีลปิด (ใหม่สุดก่อน)
  const months = useMemo(
    () => [...new Set(closedSales.map(closeMonth).filter(Boolean))].sort().reverse(),
    [closedSales]
  );
  const [month, setMonth] = useState<string>("");
  const activeMonth = month || months[0] || "";
  const [expanded, setExpanded] = useState<string | null>(null);

  // ดีลของเดือนที่เลือก + คำนวณค่าคอมต่อดีล
  const rows = useMemo(() => {
    return closedSales
      .filter(s => closeMonth(s) === activeMonth)
      .map(s => {
        const f = fkById.get(s.forklift_id);
        return { sale: s, forklift: f, comm: calcCommission(s, f, historySales) };
      })
      .sort((a, b) => String(a.sale.sales_staff || "").localeCompare(String(b.sale.sales_staff || "")) || closeDate(a.sale).localeCompare(closeDate(b.sale)));
  }, [closedSales, activeMonth, fkById]);

  // จัดกลุ่มรายบุคคล
  const byStaff = useMemo(() => {
    const m = new Map<string, { staff: string; deals: typeof rows; total: number; missing: number }>();
    rows.forEach(r => {
      const staff = r.sale.sales_staff || "(ไม่ระบุเซลล์)";
      const g = m.get(staff) ?? { staff, deals: [] as typeof rows, total: 0, missing: 0 };
      g.deals.push(r);
      g.total += r.comm.amount;
      if (r.comm.group === "FORKLIFT" && r.comm.note) g.missing += 1;
      m.set(staff, g);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const grandTotal = byStaff.reduce((s, g) => s + g.total, 0);
  const totalDeals = rows.length;
  // นับเฉพาะดีลโฟล์คลิฟท์ที่ยังไม่เลือกหมวด (ไม่รวมดีลที่ไม่เข้าเงื่อนไขค่าคอม เช่น STAXX/แฮนด์ลิฟท์)
  const totalMissing = rows.filter(r => r.comm.group === "FORKLIFT" && r.comm.note).length;

  // แก้หมวดลูกค้าของดีล (สำหรับดีลเก่าที่ยังไม่ได้เลือก) → บันทึกลง custom_fields
  const setCategory = (sale: Sale, cat: string) => {
    const cf = { ...(sale.custom_fields || {}) };
    if (cat) cf[COMMISSION_FIELD] = cat; else delete cf[COMMISSION_FIELD];
    updateSale({ ...sale, custom_fields: cf });
  };

  const exportExcel = async () => {
    if (rows.length === 0) return;
    const XLSX = await import("xlsx");
    // ชีต 1: สรุปรายคน
    const sumRows = byStaff.map((g, i) => ({
      "อันดับ": i + 1, "เซลล์": g.staff, "จำนวนดีลปิด": g.deals.length,
      "ค่าคอมรวม (บาท)": g.total, "ดีลที่ยังไม่เลือกหมวด": g.missing,
    }));
    const ws1 = XLSX.utils.json_to_sheet(sumRows);
    ws1["!cols"] = [8, 20, 14, 18, 20].map(w => ({ wch: w }));
    // ชีต 2: รายดีล
    const detRows = rows.map(r => ({
      "เซลล์": r.sale.sales_staff || "", "วันปิด": closeDate(r.sale),
      "รหัสรถ": r.sale.forklift_id || "", "SN": r.sale.forklift_unit_no || "",
      "ยี่ห้อ/รุ่น": `${r.sale.forklift_brand ?? ""} ${r.sale.forklift_model ?? ""}`.trim(),
      "กลุ่ม": r.comm.group === "STACKER" ? "STACKER" : r.comm.group === "FORKLIFT" ? "FORKLIFT" : "อื่นๆ",
      "เกณฑ์": r.comm.basis, "ยอด/กำไร (บาท)": Math.round(r.comm.basisValue),
      "หมวดลูกค้า": r.comm.category || "", "ลูกค้าเก่า(ประวัติ)": r.comm.returning ? "ใช่" : "",
      "ลูกค้า": r.sale.customer_name || "",
      "ค่าคอม (บาท)": r.comm.amount, "หมายเหตุ": r.comm.note || "",
    }));
    const ws2 = XLSX.utils.json_to_sheet(detRows);
    ws2["!cols"] = [18, 12, 16, 16, 22, 10, 8, 16, 18, 14, 20, 12, 22].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "สรุปรายคน");
    XLSX.utils.book_append_sheet(wb, ws2, "รายดีล");
    XLSX.writeFile(wb, `ค่าคอม_${activeMonth}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-2"><DollarSign className="w-5 h-5 text-white" /></div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">ค่าคอมมิชชั่นรายเดือน</h1>
                <p className="text-slate-500 text-xs">คำนวณจากดีลที่ปิด/จัดส่งแล้วในเดือนนั้น</p>
              </div>
            </div>
          </div>
          <button onClick={exportExcel} disabled={rows.length === 0}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            <Download className="w-4 h-4" /><span className="hidden sm:inline">Export Excel</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* ── ตัวเลือกเดือน ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 mr-1"><Calendar className="w-3.5 h-3.5" />เดือน</span>
          {months.length === 0 && <span className="text-sm text-slate-400">ยังไม่มีดีลปิดการขาย</span>}
          {months.map(m => (
            <button key={m} onClick={() => { setMonth(m); setExpanded(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${activeMonth === m ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-600 border-slate-200 hover:border-amber-300"}`}>
              {monthLabel(m)}
            </button>
          ))}
        </div>

        {/* ── สรุปยอดรวม ── */}
        {activeMonth && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs text-slate-500">ค่าคอมรวมทั้งเดือน</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">฿{fmt(grandTotal)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs text-slate-500">ดีลปิดการขาย</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{totalDeals}</p>
            </div>
            <div className={`rounded-2xl border shadow-sm p-4 ${totalMissing > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-100"}`}>
              <p className="text-xs text-slate-500">ยังไม่เลือกหมวด</p>
              <p className={`text-2xl font-bold mt-1 ${totalMissing > 0 ? "text-red-600" : "text-slate-800"}`}>{totalMissing}</p>
            </div>
          </div>
        )}

        {totalMissing > 0 && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            มีดีลโฟล์คลิฟท์ <b>{totalMissing}</b> รายการยังไม่ได้เลือก &ldquo;หมวดลูกค้า&rdquo; — กางดูรายดีลแล้วเลือกหมวดให้ครบ ค่าคอมถึงจะคำนวณถูก
          </div>
        )}

        {/* ── รายบุคคล ── */}
        <div className="flex flex-col gap-3">
          {byStaff.map((g, idx) => (
            <div key={g.staff} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => setExpanded(expanded === g.staff ? null : g.staff)}
                className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors text-left">
                <div className={`rounded-xl p-2 flex-shrink-0 ${idx === 0 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                  {idx === 0 ? <Award className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{g.staff}</p>
                  <p className="text-xs text-slate-500">{g.deals.length} ดีล{g.missing > 0 && <span className="text-red-600 font-semibold"> · ยังไม่เลือกหมวด {g.missing}</span>}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-amber-600">฿{fmt(g.total)}</p>
                </div>
                {expanded === g.staff ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
              </button>

              {expanded === g.staff && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {g.deals.map(r => (
                    <div key={r.sale.id} className="p-3.5 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{r.sale.forklift_brand} {r.sale.forklift_model}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.comm.group === "STACKER" ? "bg-teal-100 text-teal-700" : r.comm.group === "FORKLIFT" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{r.comm.group === "none" ? "อื่นๆ" : r.comm.group}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {r.sale.customer_name || "—"} · {r.comm.basis} ฿{fmt(Math.round(r.comm.basisValue))} · ปิด {closeDate(r.sale)}
                        </p>
                        {/* หมวดลูกค้า: forklift · ลูกค้าเก่า(จากประวัติ)ล็อกอัตโนมัติ · อื่นๆ เลือกเองได้ */}
                        {r.comm.group === "FORKLIFT" && (
                          r.comm.returning ? (
                            <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1">
                              🔁 ลูกค้าเก่า (ตรวจจากประวัติซื้อ) — คิดเรตลูกค้าเก่าอัตโนมัติ
                            </span>
                          ) : (
                            <select value={r.comm.category} onChange={e => setCategory(r.sale, e.target.value)}
                              className={`mt-1.5 text-xs border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 ${r.comm.note ? "border-red-300 text-red-700" : "border-slate-200 text-slate-700"}`}>
                              <option value="">-- เลือกหมวดลูกค้า --</option>
                              {COMMISSION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )
                        )}
                        {r.comm.group === "STACKER" && <p className="text-[11px] text-teal-600 mt-0.5">สแตกเกอร์ — คิดตามยอดขายอัตโนมัติ</p>}
                        {r.comm.group === "none" && <p className="text-[11px] text-blue-600 mt-0.5">รถกลุ่มอื่น — 1% ของยอดขาย (ทุก 100,000 = 1,000){r.comm.note ? ` · ${r.comm.note}` : ""}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold ${r.comm.amount > 0 ? "text-amber-600" : "text-slate-400"}`}>฿{fmt(r.comm.amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {activeMonth && byStaff.length === 0 && (
            <div className="text-center py-14 text-slate-400"><DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-sm">ไม่มีดีลปิดการขายในเดือนนี้</p></div>
          )}
        </div>

        {/* ── เกณฑ์ค่าคอม (อ้างอิง) ── */}
        <details className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 text-sm text-slate-600">
          <summary className="font-bold text-slate-700 cursor-pointer">เกณฑ์การคำนวณค่าคอม (อ้างอิง)</summary>
          <div className="mt-3 flex flex-col gap-3 text-xs leading-relaxed">
            <div><b className="text-teal-700">STACKER (รุ่น RE/CDD/CBS)</b> — ตามยอดขาย · &gt;100,000 = 800/คัน · ต่ำกว่า = 500/คัน</div>
            <div><b className="text-indigo-700">FORKLIFT · ลูกค้าใหม่</b> — ตามกำไรสุทธิ · ≥100k=2,000 · 80k–99,999=1,500 · 50k–79,999=1,000 · 40k–49,999=800 · 30,001–40k=700 · 25k–30k=500 · ต่ำกว่า 25k=0</div>
            <div><b className="text-indigo-700">FORKLIFT · ลูกค้าใหม่+ออกพบเอง</b> — ≥100k=2,000 · 50k–99,999=1,200 · 40k–49,999=800 · ต่ำกว่า 40k=500</div>
            <div><b className="text-indigo-700">FORKLIFT · ลูกค้าเก่า/รับช่วงต่อ</b> — ≥100k=1,500 · 40k–99,999=800 · ต่ำกว่า 40k=500</div>
            <div><b className="text-blue-700">รถกลุ่มอื่น (แฮนด์ลิฟท์/CBD/CNS ฯลฯ)</b> — 1% ของยอดขาย (ทุก 100,000 บาท = 1,000 บาท) · คำนวณจากยอดรวมทั้งเดือน</div>
            <div className="text-slate-400">กำไรสุทธิ = ราคาขาย − ทุน − อุปกรณ์เสริม − ของแถม − ค่าขนส่ง · นับเฉพาะดีลปิด/จัดส่งแล้ว · <b>ไม่รวมดีลนำเข้าจากบิลภาษี GR</b> · ค่าคอมคำนวณอัตโนมัติ (แก้ไขไม่ได้)</div>
          </div>
        </details>
      </main>
    </div>
  );
}
