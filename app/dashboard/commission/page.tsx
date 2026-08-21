"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  ArrowLeft, DollarSign, Download, ChevronDown, ChevronRight,
  User, AlertCircle, Award, Calendar, Lock, Unlock,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import {
  calcCommission, isClosedSale, closeMonth, closeDate,
  commissionMonth, isCommPending,
  COMMISSION_FIELD, COMMISSION_CATEGORIES, CommissionLock, warrantyFilled,
} from "@/lib/commission";
import { DashboardGuard } from "@/components/DashboardGuard";
import { staffLabel } from "@/lib/constants";
import { supabase } from "@/lib/supabaseClient";
import type { Sale } from "@/lib/types";

const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH");
const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthLabel = (ym: string) => { const [y, m] = ym.split("-"); return `${MONTHS_TH[Number(m) - 1] ?? m} ${Number(y) + 543}`; };
const WARRANTY_GATE_FROM = "2026-08"; // เริ่มบังคับลงรับประกันก่อนจ่ายค่าคอม ตั้งแต่ ส.ค. 2569 (ไม่ย้อนดีลเก่า)
// แยกงวดค่าคอมเป็น "รายเดือน" (ห้ามรวมสะสม) · ผู้ใช้เคาะ 20 ส.ค.
// ดีลเก่า (ปิด ≤ ก.ค. 69 · ไม่มีวันรับเงิน) → จัดงวดตาม "วันปิดการขาย" · ตั้งแต่ ส.ค. → ตาม "วันรับเงิน"
const HIST_CUTOFF = "2026-07";
// เริ่มจ่ายค่าคอมผ่านแอปตั้งแต่ ก.ค. 2569 เป็นต้นมา · เดือนก่อนหน้า = บันทึกไว้อ้างอิง (ไม่จ่ายผ่านแอป)
const APP_PAYOUT_FROM = "2026-07";
const tabLabel = (k: string) => monthLabel(k);
// วันจ่ายค่าคอม = 25 ของเดือนถัดไป
const payoutLabelOf = (k: string) => monthLabel(payoutDateHelper(k));
function payoutDateHelper(ym: string) { const [y, m] = ym.split("-").map(Number); if (!y || !m) return ym; return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; }
// ดีลเก่า (ปิด ≤ ก.ค. 69) — จัดตามวันปิดการขาย (ไม่ต้องรอวันรับเงิน)
const inHistorical = (s: Sale) => { const c = closeMonth(s); return !!c && c <= HIST_CUTOFF; };
// งวดของดีล (YYYY-MM): ดีลเก่า=เดือนที่ปิดการขาย · ดีลใหม่=เดือนที่รับเงิน · "" = ยังไม่รับเงิน (รอรับเงิน)
const periodOf = (s: Sale) => { const c = closeMonth(s); return c && c <= HIST_CUTOFF ? c : commissionMonth(s); };

function CommissionPageInner() {
  const { sales, forklifts, updateSale, fieldConfig, setCommissionLock, toggleResignedStaff } = useApp();
  const fkById = useMemo(() => new Map(forklifts.map(f => [f.id, f])), [forklifts]);

  // ประวัติซื้อทั้งหมด (รวมบิล GR) — ใช้ตรวจ "ลูกค้าเก่า" (เคยซื้อมาก่อน = ลูกค้าเก่าเสมอ)
  const historySales = useMemo(() => sales.filter(isClosedSale), [sales]);
  // ดีลที่นำมาคิดค่าคอม = ปิดจริง แต่ตัดดีลนำเข้าบิลภาษี GR ออก (ไม่จ่ายค่าคอม)
  // รวมดีลนำเข้าบิลภาษีมาคิดค่าคอมด้วย (ผู้ใช้เคาะ 20 ส.ค. — ใส่ชื่อเซลล์ให้ดีลนำเข้าแล้ว)
  const closedAll = useMemo(() => sales.filter(s => isClosedSale(s)), [sales]);
  // งวดค่าคอม: ดีลเก่า (ปิด ≤ ก.ค.) เข้างวดแรกตามวันปิด · ดีลใหม่ (ส.ค.+) ใช้วันรับเงิน · ยังไม่รับเงิน → "รอรับเงิน"
  const closedSales = useMemo(() => closedAll.filter(s => periodOf(s) !== ""), [closedAll]);
  // รอรับเงินจริง = ปิดหลัง ก.ค. + ยังไม่กรอกวันรับเงิน (ดีลเก่าเข้างวดแรกอัตโนมัติ ไม่ต้องกรอก)
  const pendingDeals = useMemo(() => closedAll.filter(s => !inHistorical(s) && isCommPending(s)), [closedAll]);

  // งวด = รายเดือน (ใหม่→เก่า) · แยกทุกเดือน ไม่รวมสะสม
  const months = useMemo(() => {
    const raw = [...new Set(closedSales.map(periodOf).filter(Boolean))];
    const lockKeys = Object.keys(fieldConfig.commissionLocks || {});
    return [...new Set([...raw, ...lockKeys])].sort().reverse();
  }, [closedSales, fieldConfig.commissionLocks]);
  const [month, setMonth] = useState<string>("");
  const activeMonth = month || months[0] || "";
  const [expanded, setExpanded] = useState<string | null>(null);

  // ดีลของเดือนที่เลือก + คำนวณค่าคอมต่อดีล
  const rows = useMemo(() => {
    return closedSales
      .filter(s => periodOf(s) === activeMonth)
      .map(s => {
        const f = fkById.get(s.forklift_id);
        const comm0 = calcCommission(s, f, historySales);
        // กันจ่ายค่าคอม: ยังไม่ลงรับประกัน → ค่าคอม 0 · แต่บังคับเฉพาะดีลที่ปิดตั้งแต่ ส.ค. 2569 (ไม่ย้อนดีลเก่า)
        const gated = closeMonth(s) >= WARRANTY_GATE_FROM;
        const wf = !gated || warrantyFilled(f); // ดีลเก่า = ผ่านเสมอ
        const comm = wf ? comm0 : { ...comm0, amount: 0, note: (comm0.note ? comm0.note + " · " : "") + "ยังไม่ลงข้อมูลรับประกัน" };
        return { sale: s, forklift: f, comm, warranty: wf };
      })
      .sort((a, b) => String(a.sale.sales_staff || "").localeCompare(String(b.sale.sales_staff || "")) || closeDate(a.sale).localeCompare(closeDate(b.sale)));
  }, [closedSales, activeMonth, fkById]);

  // จัดกลุ่มรายบุคคล
  const byStaff = useMemo(() => {
    const m = new Map<string, { staff: string; deals: typeof rows; total: number; missing: number; warrantyMissing: number; noneCount: number; noneSaleTotal: number; noneComm: number }>();
    rows.forEach(r => {
      const staff = r.sale.sales_staff || "(ไม่ระบุเซลล์)";
      const g = m.get(staff) ?? { staff, deals: [] as typeof rows, total: 0, missing: 0, warrantyMissing: 0, noneCount: 0, noneSaleTotal: 0, noneComm: 0 };
      g.deals.push(r);
      if (r.comm.group !== "none") g.total += r.comm.amount; // รถกลุ่มอื่นคิดรวมทั้งเดือนทีหลัง (ไม่คิดทีละใบ)
      if (r.comm.group === "FORKLIFT" && r.comm.note && r.warranty) g.missing += 1; // ยังไม่เลือกหมวด (แยกจากขาดรับประกัน)
      if (!r.warranty) g.warrantyMissing += 1;
      m.set(staff, g);
    });
    // รถกลุ่มอื่น (แฮนด์ลิฟท์/CBD/CNS) — รวมยอดขายทั้งเดือนก่อน คิด 1% ครั้งเดียว · เฉพาะดีลที่ลงรับประกันแล้ว
    m.forEach(g => {
      const none = g.deals.filter(r => r.comm.group === "none" && r.warranty);
      g.noneCount = none.length;
      g.noneSaleTotal = none.reduce((s, r) => s + (Number(r.sale.actual_sale) || 0), 0);
      g.noneComm = Math.round(g.noneSaleTotal * 0.01);
      g.total += g.noneComm;
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const grandTotal = byStaff.reduce((s, g) => s + g.total, 0);
  const totalDeals = rows.length;
  // นับเฉพาะดีลโฟล์คลิฟท์ที่ยังไม่เลือกหมวด (ไม่รวมดีลที่ไม่เข้าเงื่อนไขค่าคอม เช่น STAXX/แฮนด์ลิฟท์)
  const totalMissing = rows.filter(r => r.comm.group === "FORKLIFT" && r.comm.note && r.warranty).length;
  const totalWarrantyMissing = rows.filter(r => !r.warranty).length; // ดีลที่ยังไม่ลงรับประกัน → ค่าคอม 0

  // ── ล็อก snapshot รายเดือน ── ถ้าเดือนนี้ถูกล็อก → แสดงตัวเลขจาก snapshot (คงที่)
  const lock = fieldConfig.commissionLocks?.[activeMonth] || null;
  const locked = !!lock;

  // กลุ่มแสดงผล (normalize ให้เหมือนกันทั้งสด/ล็อก) — ล็อก: จาก snapshot · สด: จาก byStaff
  const displayGroups = useMemo(() => {
    if (lock) {
      return lock.staff.map(s => ({
        staff: s.staff, total: s.total, dealCount: s.dealCount, missing: s.missing,
        noneCount: s.noneCount, noneSaleTotal: s.noneSaleTotal, noneComm: s.noneComm,
        deals: lock.deals.filter(d => d.staff === s.staff).map(d => ({
          key: d.saleId, saleId: d.saleId, brand: d.brand, model: d.model, customer: d.customer,
          group: d.group, basis: d.basis, basisValue: d.basisValue, category: d.category,
          returning: d.returning, amount: d.amount, closeDate: d.closeDate, note: "", warranty: true,
        })),
      }));
    }
    return byStaff.map(g => ({
      staff: g.staff, total: g.total, dealCount: g.deals.length, missing: g.missing,
      noneCount: g.noneCount, noneSaleTotal: g.noneSaleTotal, noneComm: g.noneComm,
      deals: g.deals.map(r => ({
        key: r.sale.id, saleId: r.sale.id, brand: r.sale.forklift_brand || "", model: r.sale.forklift_model || "",
        customer: r.sale.customer_name || "", group: r.comm.group, basis: r.comm.basis, basisValue: r.comm.basisValue,
        category: r.comm.category, returning: !!r.comm.returning, amount: r.comm.amount, closeDate: closeDate(r.sale), note: r.comm.note || "", warranty: r.warranty,
      })),
    }));
  }, [lock, byStaff]);

  const dGrand = locked ? lock!.grandTotal : grandTotal;
  const dDeals = locked ? lock!.deals.length : totalDeals;
  const dMissing = locked ? lock!.staff.reduce((a, s) => a + s.missing, 0) : totalMissing;

  // ล็อกเดือน → เก็บ snapshot ตัวเลขปัจจุบัน · ปลดล็อก → กลับไปคำนวณสด
  const doLock = async () => {
    if (!activeMonth || byStaff.length === 0) return;
    if (!window.confirm(`ล็อกค่าคอม${tabLabel(activeMonth)}?\n\nตัวเลขจะถูกบันทึกคงที่ แม้แก้ไขดีลย้อนหลังก็จะไม่เปลี่ยน (ปลดล็อกได้ภายหลัง)`)) return;
    let by = "ฝ่ายสต็อก";
    try { const r = await supabase?.auth.getUser(); by = r?.data.user?.email || by; } catch {}
    const snap: CommissionLock = {
      month: activeMonth, lockedAt: new Date().toISOString(), lockedBy: by, grandTotal,
      staff: byStaff.map(g => ({ staff: g.staff, total: g.total, dealCount: g.deals.length, missing: g.missing, noneCount: g.noneCount, noneSaleTotal: g.noneSaleTotal, noneComm: g.noneComm })),
      deals: rows.map(r => ({
        saleId: r.sale.id, staff: r.sale.sales_staff || "(ไม่ระบุเซลล์)", brand: r.sale.forklift_brand || "", model: r.sale.forklift_model || "",
        customer: r.sale.customer_name || "", group: r.comm.group, basis: r.comm.basis, basisValue: r.comm.basisValue,
        category: r.comm.category, returning: !!r.comm.returning, amount: r.comm.amount, closeDate: closeDate(r.sale),
      })),
    };
    setCommissionLock(activeMonth, snap);
  };
  const doUnlock = () => {
    if (!activeMonth || !lock) return;
    if (!window.confirm(`ปลดล็อกค่าคอม${tabLabel(activeMonth)}?\n\nระบบจะกลับไปคำนวณสดจากดีลปัจจุบัน (ตัวเลขอาจเปลี่ยน)`)) return;
    setCommissionLock(activeMonth, null);
  };

  // แก้หมวดลูกค้าของดีล (สำหรับดีลเก่าที่ยังไม่ได้เลือก) → บันทึกลง custom_fields
  const setCategory = (saleId: string, cat: string) => {
    const sale = sales.find(x => x.id === saleId);
    if (!sale) return;
    const cf = { ...(sale.custom_fields || {}) };
    if (cat) cf[COMMISSION_FIELD] = cat; else delete cf[COMMISSION_FIELD];
    updateSale({ ...sale, custom_fields: cf });
  };

  const exportExcel = async () => {
    if (displayGroups.length === 0) return;
    const XLSX = await import("xlsx");
    // ชีต 1: สรุปรายคน (ใช้ตัวเลขที่แสดง — ล็อกแล้วก็ส่งออกตาม snapshot)
    const sumRows = displayGroups.map((g, i) => ({
      "อันดับ": i + 1, "เซลล์": g.staff, "จำนวนดีลปิด": g.dealCount,
      "รถกลุ่มอื่น: จำนวนใบ": g.noneCount, "รถกลุ่มอื่น: ยอดขายรวม": g.noneSaleTotal, "รถกลุ่มอื่น: ค่าคอม 1%": g.noneComm,
      "ค่าคอมรวม (บาท)": g.total, "ดีลที่ยังไม่เลือกหมวด": g.missing,
    }));
    const ws1 = XLSX.utils.json_to_sheet(sumRows);
    ws1["!cols"] = [8, 20, 14, 16, 18, 16, 18, 20].map(w => ({ wch: w }));
    // ชีต 2: รายดีล
    const detRows = displayGroups.flatMap(g => g.deals.map(d => ({
      "เซลล์": g.staff, "วันปิด": d.closeDate,
      "ยี่ห้อ/รุ่น": `${d.brand} ${d.model}`.trim(),
      "กลุ่ม": d.group === "STACKER" ? "STACKER" : d.group === "FORKLIFT" ? "FORKLIFT" : "อื่นๆ",
      "เกณฑ์": d.basis, "ยอด/กำไร (บาท)": Math.round(d.basisValue),
      "หมวดลูกค้า": d.category || "", "ลูกค้าเก่า(ประวัติ)": d.returning ? "ใช่" : "",
      "ลูกค้า": d.customer,
      // รถกลุ่มอื่นคิดรวมทั้งเดือน (ดูชีตสรุป) → ไม่ลงค่าคอมทีละใบ กันนับซ้ำ
      "ค่าคอม (บาท)": d.group === "none" ? "" : d.amount,
      "หมายเหตุ": d.group === "none" ? "รวมคิด 1% ที่ยอดเดือน (ดูชีตสรุป)" : (d.note || ""),
    })));
    const ws2 = XLSX.utils.json_to_sheet(detRows);
    ws2["!cols"] = [18, 12, 22, 10, 8, 16, 18, 14, 20, 12, 22].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "สรุปรายคน");
    XLSX.utils.book_append_sheet(wb, ws2, "รายดีล");
    XLSX.writeFile(wb, `ค่าคอม_${activeMonth}${locked ? "_ล็อก" : ""}.xlsx`);
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
          <div className="flex items-center gap-2">
            {activeMonth && (locked ? (
              <button onClick={doUnlock}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg px-3 py-2 transition-all">
                <Unlock className="w-4 h-4" /><span className="hidden sm:inline">ปลดล็อก</span>
              </button>
            ) : (
              <button onClick={doLock} disabled={byStaff.length === 0}
                className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <Lock className="w-4 h-4" /><span className="hidden sm:inline">ล็อกเดือนนี้</span>
              </button>
            ))}
            <button onClick={exportExcel} disabled={displayGroups.length === 0}
              className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              <Download className="w-4 h-4" /><span className="hidden sm:inline">Export Excel</span>
            </button>
          </div>
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
              {tabLabel(m)}
            </button>
          ))}
          {/* จ่ายวันที่ 25 เดือนถัดไป · เดือนก่อน ก.ค.69 = บันทึกอ้างอิง (ยังไม่จ่ายผ่านแอป) */}
          {activeMonth && (activeMonth >= APP_PAYOUT_FROM
            ? <span className="ml-auto text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">💰 จ่ายให้ฝ่ายขาย {payoutLabelOf(activeMonth)}</span>
            : <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5">📁 ก่อนเริ่มจ่ายผ่านแอป (บันทึกอ้างอิง)</span>)}
        </div>
        <p className="text-[11px] text-slate-400 -mt-3 px-1">แยกรายเดือน · เริ่มจ่ายผ่านแอป <b className="text-slate-500">ก.ค. 69</b> เป็นต้นไป (จ่าย 25 เดือนถัดไป) · ดีลเก่า=เดือนที่<b className="text-slate-500">ปิดการขาย</b> · ดีลใหม่=เดือนที่<b className="text-slate-500">เงินเข้าบัญชี</b></p>

        {/* ⏳ ดีลรอรับเงิน — ยังไม่เข้างวด ไม่คิดค่าคอมจนกว่าจะกรอกวันรับเงิน */}
        {pendingDeals.length > 0 && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">⏳ รอรับเงิน {pendingDeals.length} ดีล</span> — ดีลใหม่ (ปิดตั้งแต่ ส.ค. 69) ที่ยังไม่กรอก &ldquo;วันที่รับเงิน&rdquo; → <b>ยังไม่เข้างวด ไม่คิดค่าคอม</b>
              <span className="block text-xs text-amber-600 mt-0.5">ดีลเก่า (ปิด ≤ ก.ค. 69) เข้าเดือนที่ปิดการขายอัตโนมัติแล้ว ไม่ต้องกรอก · ดีลใหม่พอเงินเข้าบัญชีให้กรอกวันที่รับเงิน → ตกงวดเดือนนั้นทันที</span>
            </div>
          </div>
        )}

        {/* ── แบนเนอร์เมื่อเดือนนี้ถูกล็อก ── */}
        {locked && lock && (
          <div className="text-sm text-slate-700 bg-slate-800/[0.03] border border-slate-300 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800">ค่าคอมเดือนนี้ถูกล็อกแล้ว</span> — ตัวเลขคงที่ แม้แก้ไขดีลย้อนหลังก็จะไม่เปลี่ยน
              <span className="block text-xs text-slate-500 mt-0.5">ล็อกโดย {lock.lockedBy} · เมื่อ {String(lock.lockedAt).slice(0, 10)} · กด &ldquo;ปลดล็อก&rdquo; เพื่อกลับไปคำนวณสด</span>
            </div>
          </div>
        )}

        {/* ── สรุปยอดรวม ── */}
        {activeMonth && (
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-2xl border shadow-sm p-4 ${locked ? "bg-amber-50/60 border-amber-200" : "bg-white border-slate-100"}`}>
              <p className="text-xs text-slate-500 flex items-center gap-1">ค่าคอมรวมทั้งเดือน{locked && <Lock className="w-3 h-3 text-amber-500" />}</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">฿{fmt(dGrand)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-xs text-slate-500">ดีลปิดการขาย</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{dDeals}</p>
            </div>
            <div className={`rounded-2xl border shadow-sm p-4 ${dMissing > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-100"}`}>
              <p className="text-xs text-slate-500">ยังไม่เลือกหมวด</p>
              <p className={`text-2xl font-bold mt-1 ${dMissing > 0 ? "text-red-600" : "text-slate-800"}`}>{dMissing}</p>
            </div>
          </div>
        )}

        {dMissing > 0 && !locked && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            มีดีลโฟล์คลิฟท์ <b>{dMissing}</b> รายการยังไม่ได้เลือก &ldquo;หมวดลูกค้า&rdquo; — กางดูรายดีลแล้วเลือกหมวดให้ครบ ค่าคอมถึงจะคำนวณถูก
          </div>
        )}
        {totalWarrantyMissing > 0 && !locked && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            มี <b>{totalWarrantyMissing}</b> ดีล<b>ยังไม่ลงข้อมูลรับประกัน/บริการหลังการขาย → ค่าคอม 0</b> · ฝ่ายขายต้องลงข้อมูลรับประกันในหน้าขาย (กล่องรายละเอียดการขาย) ให้ครบก่อน
          </div>
        )}

        {/* ── รายบุคคล ── */}
        <div className="flex flex-col gap-3">
          {displayGroups.map((g, idx) => (
            <div key={g.staff} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <button onClick={() => setExpanded(expanded === g.staff ? null : g.staff)}
                className="w-full flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors text-left">
                <div className={`rounded-xl p-2 flex-shrink-0 ${idx === 0 ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                  {idx === 0 ? <Award className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm">{staffLabel(g.staff, fieldConfig.resignedStaff ?? [])}</p>
                  <p className="text-xs text-slate-500">{g.dealCount} ดีล{g.missing > 0 && !locked && <span className="text-red-600 font-semibold"> · ยังไม่เลือกหมวด {g.missing}</span>}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-amber-600 flex items-center gap-1 justify-end">{locked && <Lock className="w-3.5 h-3.5 text-amber-500" />}฿{fmt(g.total)}</p>
                </div>
                {expanded === g.staff ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
              </button>

              {expanded === g.staff && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {/* ทำเครื่องหมายเซลล์ลาออก — โชว์ "(ลาออก)" ต่อท้ายทุกหน้า · ข้อมูล/ยอดเก่ายังอยู่ครบ */}
                  {g.staff !== "(ไม่ระบุเซลล์)" && (
                    <label className="flex items-center gap-2 p-3 bg-slate-50/60 cursor-pointer text-xs text-slate-600">
                      <input type="checkbox" checked={(fieldConfig.resignedStaff ?? []).includes(g.staff)}
                        onChange={e => toggleResignedStaff(g.staff, e.target.checked)} className="w-4 h-4 accent-slate-600" />
                      <span>ทำเครื่องหมายว่า <b>ลาออกแล้ว</b> — ชื่อจะขึ้น &ldquo;{g.staff} (ลาออก)&rdquo; ทุกหน้า (ยอด/ค่าคอมย้อนหลังยังอยู่ครบ)</span>
                    </label>
                  )}
                  {g.deals.filter(d => d.group !== "none").map(d => (
                    <div key={d.key} className="p-3.5 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">{d.brand} {d.model}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${d.group === "STACKER" ? "bg-teal-100 text-teal-700" : d.group === "FORKLIFT" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>{d.group === "none" ? "อื่นๆ" : d.group}</span>
                          {d.warranty === false && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">⚠️ ยังไม่ลงรับประกัน · คอม 0</span>}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {d.customer || "—"} · {d.basis} ฿{fmt(Math.round(d.basisValue))} · ปิด {d.closeDate}
                        </p>
                        {/* หมวดลูกค้า: forklift · ลูกค้าเก่า(จากประวัติ)ล็อกอัตโนมัติ · อื่นๆ เลือกเองได้ (ล็อกแล้วดูอย่างเดียว) */}
                        {d.group === "FORKLIFT" && (
                          d.returning ? (
                            <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2 py-1">
                              🔁 ลูกค้าเก่า (ตรวจจากประวัติซื้อ) — คิดเรตลูกค้าเก่าอัตโนมัติ
                            </span>
                          ) : locked ? (
                            <span className="inline-block mt-1.5 text-[11px] text-slate-500">หมวด: <b className="text-slate-700">{d.category || "— ไม่ได้เลือก —"}</b></span>
                          ) : (
                            <select value={d.category} onChange={e => setCategory(d.saleId, e.target.value)}
                              className={`mt-1.5 text-xs border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 ${d.note ? "border-red-300 text-red-700" : "border-slate-200 text-slate-700"}`}>
                              <option value="">-- เลือกหมวดลูกค้า --</option>
                              {COMMISSION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )
                        )}
                        {d.group === "STACKER" && <p className="text-[11px] text-teal-600 mt-0.5">สแตกเกอร์ — คิดตามยอดขายอัตโนมัติ</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold ${d.amount > 0 ? "text-amber-600" : "text-slate-400"}`}>฿{fmt(d.amount)}</p>
                      </div>
                    </div>
                  ))}
                  {/* รถกลุ่มอื่น (แฮนด์ลิฟท์/CBD/CNS) — รวมยอดขายทั้งเดือนแล้วคิด 1% ครั้งเดียว (ไม่แยกทีละใบ) */}
                  {g.noneCount > 0 && (
                    <div className="p-3.5 flex items-center gap-3 text-sm bg-blue-50/40">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800">รถกลุ่มอื่น (แฮนด์ลิฟท์/CBD/CNS ฯลฯ)</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">อื่นๆ · รวมทั้งเดือน</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{g.noneCount} ใบ · ยอดขายรวมทั้งเดือน ฿{fmt(g.noneSaleTotal)}</p>
                        <p className="text-[11px] text-blue-600 mt-0.5">คิด 1% ของยอดรวม (ทุก 100,000 บาท = 1,000 บาท)</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-bold ${g.noneComm > 0 ? "text-amber-600" : "text-slate-400"}`}>฿{fmt(g.noneComm)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {activeMonth && displayGroups.length === 0 && (
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
            <div className="text-slate-500 flex items-start gap-1.5"><Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" /><span><b>ล็อกเดือน:</b> กด &ldquo;ล็อกเดือนนี้&rdquo; หลังจ่ายค่าคอมแล้ว → ตัวเลขจะคงที่ (freeze) แม้แก้ไขดีลย้อนหลัง · ปลดล็อกเพื่อกลับไปคำนวณสด</span></div>
          </div>
        </details>
      </main>
    </div>
  );
}

export default function CommissionPage() {
  return <DashboardGuard><CommissionPageInner /></DashboardGuard>;
}
