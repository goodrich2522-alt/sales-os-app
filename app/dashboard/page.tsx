"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, TrendingUp, Package, Users, BarChart3, DollarSign, Award,
  ChevronRight, User, Lock, Eye, EyeOff, X, Calendar, MapPin,
} from "lucide-react";
import { useApp } from "@/lib/AppContext";
import {
  mockMonthlySales, mockSalesLeaderboard, mockBrandShare,
  mockTopModels, mockPaymentTypes, getRegion,
} from "@/lib/mockData";
import { buildStaffMonthly, buildStaffWeekly, buildAllMonthlyWeekly, MONTH_LABELS } from "@/components/charts/Charts";
import { Sale } from "@/lib/types";

const SalesRevenueChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.SalesRevenueChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const BrandShareChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.BrandShareChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const StockStatusChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.StockStatusChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const PaymentTypeChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.PaymentTypeChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const StaffRevenueChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.StaffRevenueChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const WeeklyBreakdownChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.WeeklyBreakdownChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
const SaleTypeChart = dynamic(
  () => import("@/components/charts/Charts").then((m) => ({ default: m.SaleTypeChart })),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

const totalRevenue = mockMonthlySales.reduce((s, m) => s + m.revenue, 0);
const totalUnits   = mockMonthlySales.reduce((s, m) => s + m.units, 0);
const avgRevenue   = Math.round(totalRevenue / mockMonthlySales.length);

function fmt(n: number)  { return Number(n).toLocaleString("th-TH"); }
function fmtM(n: number) { return (n / 1_000_000).toFixed(2) + " ล."; }

function ChartSkeleton() {
  return <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" />;
}

const DASHBOARD_PASSWORD = "admin2024";

const REGION_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  "เหนือ":  { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   dot: "#3B82F6" },
  "กลาง":   { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "#10B981" },
  "อีสาน":  { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "#F59E0B" },
  "ใต้":    { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", dot: "#8B5CF6" },
};

const CONTACT_SOURCE_COLORS: Record<string, string> = {
  "Line":          "bg-green-100 text-green-700",
  "Facebook":      "bg-blue-100 text-blue-700",
  "TikTok":        "bg-pink-100 text-pink-700",
  "โทร":           "bg-indigo-100 text-indigo-700",
  "Google":        "bg-orange-100 text-orange-700",
  "คนอื่นบอกต่อ": "bg-violet-100 text-violet-700",
};

export default function Dashboard() {
  const [dashAuth, setDashAuth] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passError, setPassError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const { sales, forklifts } = useApp();
  const staffNames = Array.from(
    new Set([...mockSalesLeaderboard.map((l) => l.name), ...sales.map((s) => s.sales_staff)])
  );
  const [selectedStaff, setSelectedStaff] = useState(mockSalesLeaderboard[0]?.name ?? "");
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const [globalDrillMonth, setGlobalDrillMonth] = useState<string | null>(null);
  const [regionModal, setRegionModal] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem("dash_auth") === "1") setDashAuth(true);
  }, []);

  // ── All hooks must be called before any early return ──────────────────────────
  const regionData = useMemo(() => {
    const regions: Record<string, Sale[]> = { "เหนือ": [], "กลาง": [], "อีสาน": [], "ใต้": [] };
    sales.forEach(s => {
      const r = getRegion(s.province);
      regions[r].push(s);
    });
    const total = sales.length || 1;
    return (["กลาง", "อีสาน", "เหนือ", "ใต้"] as const).map(region => ({
      region,
      count: regions[region].length,
      pct: Math.round((regions[region].length / total) * 100),
      sales: regions[region],
    })).sort((a, b) => b.count - a.count);
  }, [sales]);

  const liveTopModels = useMemo(() => {
    const map: Record<string, number> = {};
    sales.forEach(s => {
      const key = `${s.forklift_brand} ${s.forklift_model}`;
      map[key] = (map[key] ?? 0) + 1;
    });
    const total = sales.length || 1;
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([model, count]) => ({ model, count, pct: Math.round((count / total) * 100) }));
  }, [sales]);

  const contactSourceData = useMemo(() => {
    const ALL_SOURCES = ["Line", "Facebook", "TikTok", "โทร", "Google", "คนอื่นบอกต่อ"];
    const map: Record<string, number> = {};
    ALL_SOURCES.forEach(s => { map[s] = 0; });
    sales.forEach(s => {
      if (s.contact_source) map[s.contact_source] = (map[s.contact_source] ?? 0) + 1;
    });
    const total = sales.length || 1;
    return ALL_SOURCES.map(src => ({
      source: src,
      count: map[src] ?? 0,
      pct: Math.round(((map[src] ?? 0) / total) * 100),
    })).sort((a, b) => b.count - a.count);
  }, [sales]);

  const saleTypeData = useMemo(() => {
    const COLORS: Record<string, string> = {
      "รถขายเต็มคัน": "#6366F1",
      "รถมือสอง":     "#10B981",
      "รถเช่า":       "#F59E0B",
      "งานซ่อม":      "#EF4444",
    };
    const map: Record<string, { count: number; revenue: number }> = {};
    sales.forEach(s => {
      const t = s.sale_type ?? "รถขายเต็มคัน";
      if (!map[t]) map[t] = { count: 0, revenue: 0 };
      map[t].count++;
      map[t].revenue += s.actual_sale;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([type, d]) => ({ type, count: d.count, revenue: d.revenue, color: COLORS[type] ?? "#64748B" }));
  }, [sales]);

  const handleDashLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passInput.trim() === DASHBOARD_PASSWORD) {
      sessionStorage.setItem("dash_auth", "1");
      setDashAuth(true);
    } else {
      setPassError("รหัสผ่านไม่ถูกต้อง");
      setPassInput("");
    }
  };

  if (!dashAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-violet-500 to-purple-700" />
            <div className="p-8">
              <div className="flex flex-col items-center mb-8">
                <div className="bg-gradient-to-br from-violet-500 to-purple-700 rounded-2xl p-4 mb-4 shadow-lg shadow-violet-200">
                  <BarChart3 className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-slate-800">แดชบอร์ด</h1>
                <p className="text-slate-500 text-sm mt-1 text-center">ข้อมูลภายในบริษัท — กรุณายืนยันตัวตน</p>
                <div className="mt-3 bg-violet-50 border border-violet-100 rounded-xl px-4 py-2 text-xs text-violet-700 font-medium">
                  รหัสทดสอบ: admin2024
                </div>
              </div>
              <form onSubmit={handleDashLogin} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">รหัสผ่านแดชบอร์ด</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type={showPass ? "text" : "password"} value={passInput}
                      onChange={(e) => { setPassInput(e.target.value); setPassError(""); }}
                      placeholder="กรอกรหัสผ่าน..."
                      className={`w-full pl-10 pr-11 py-3 border rounded-xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all ${passError ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passError && <p className="text-red-500 text-xs mt-1.5">{passError}</p>}
                </div>
                <button type="submit"
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm">
                  <Lock className="w-4 h-4" />เข้าดูแดชบอร์ด
                </button>
              </form>
              <Link href="/" className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mt-5 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />กลับหน้าหลัก
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const staffSales   = sales.filter((s) => s.sales_staff === selectedStaff);
  const staffRevenue = staffSales.reduce((sum, s) => sum + s.actual_sale, 0);
  const staffUnits   = staffSales.length;
  const staffMonthly = buildStaffMonthly(sales, selectedStaff);

  const staffModelMap: Record<string, number> = {};
  staffSales.forEach((s) => {
    const key = `${s.forklift_brand} ${s.forklift_model}`;
    staffModelMap[key] = (staffModelMap[key] ?? 0) + 1;
  });
  const staffModels = Object.entries(staffModelMap).sort((a, b) => b[1] - a[1]);

  const liveStockStatus = [
    { name: "พร้อมขาย",        value: forklifts.filter((f) => f.status === "พร้อมขาย").length,        color: "#10B981" },
    { name: "จองแล้ว",         value: forklifts.filter((f) => f.status === "จองแล้ว").length,         color: "#F59E0B" },
    { name: "รอผ่านไฟแนนซ์",  value: sales.filter((s) => s.sale_status === "รอผ่านไฟแนนซ์").length,  color: "#EF4444" },
    { name: "ส่งมอบแล้ว",     value: forklifts.filter((f) => f.status === "ส่งมอบแล้ว").length,      color: "#6366F1" },
  ];

  // Drill-down data for staff
  const drillData = drillMonth ? buildStaffWeekly(sales, selectedStaff, drillMonth) : null;
  const drillModelMap: Record<string, number> = {};
  drillData?.allSales.forEach((s) => {
    const key = `${s.forklift_brand} ${s.forklift_model}`;
    drillModelMap[key] = (drillModelMap[key] ?? 0) + 1;
  });
  const drillModels = Object.entries(drillModelMap).sort((a, b) => b[1] - a[1]);

  // Global monthly weekly drill-down
  const globalDrillData = globalDrillMonth ? buildAllMonthlyWeekly(sales, globalDrillMonth) : null;

  const topRegion = regionData[0];
  const modalSales = regionModal ? regionData.find(r => r.region === regionModal)?.sales ?? [] : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl p-2">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">แดชบอร์ดวิเคราะห์</h1>
                <p className="text-slate-500 text-xs">ข้อมูลสถิติการขายและสินค้าคงคลัง</p>
              </div>
            </div>
          </div>
          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full hidden sm:block">ปีงบประมาณ 2024</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard icon={<DollarSign className="w-5 h-5" />} label="รายได้รวม"    value={`฿${fmtM(totalRevenue)}`} sub="ปี 2024"       color="text-blue-700"    iconBg="bg-blue-600"    accent="border-l-blue-500" />
          <KPICard icon={<Package className="w-5 h-5" />}    label="ขายได้"        value={`${totalUnits} คัน`}       sub="ทั้งปี"       color="text-emerald-700" iconBg="bg-emerald-500" accent="border-l-emerald-500" />
          <KPICard icon={<TrendingUp className="w-5 h-5" />}  label="เฉลี่ย/เดือน" value={`฿${fmtM(avgRevenue)}`}   sub="avg monthly"   color="text-violet-700"  iconBg="bg-violet-600"  accent="border-l-violet-500" />
          <KPICard icon={<Users className="w-5 h-5" />}       label="พนักงานขาย"   value={`${staffNames.length} คน`}  sub="active staff"  color="text-orange-700"  iconBg="bg-orange-500"  accent="border-l-orange-500" />
        </div>

        {/* Row 1: Sales Performance — clickable monthly chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <SectionHeader icon={<TrendingUp className="w-4 h-4 text-blue-600" />} title="ยอดขายรายเดือน" sub="คลิกแท่งกราฟเพื่อดูรายสัปดาห์" iconBg="bg-blue-50" />
              {globalDrillMonth && (
                <button onClick={() => setGlobalDrillMonth(null)} className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-all">
                  <X className="w-3.5 h-3.5" />ปิด
                </button>
              )}
            </div>
            <div className="h-60 mt-5">
              <SalesRevenueChart
                data={mockMonthlySales}
                onBarClick={(month) => setGlobalDrillMonth(globalDrillMonth === month ? null : month)}
                activeMonth={globalDrillMonth ?? undefined}
              />
            </div>
            {/* Global monthly drill-down */}
            {globalDrillMonth && globalDrillData && (
              <div className="mt-4 border-t border-blue-100 pt-4">
                <p className="text-xs font-bold text-slate-700 mb-3">ยอดขายรายสัปดาห์ — เดือน{globalDrillMonth} (ทุกเซลล์)</p>
                <div className="h-40 bg-blue-50 rounded-xl border border-blue-100 p-3">
                  <WeeklyBreakdownChart data={globalDrillData.weeks.map((w) => ({ week: w.week.split("\n")[0], revenue: w.revenue, units: w.units }))} />
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {globalDrillData.weeks.map((w, i) => (
                    <div key={i} className="bg-white border border-slate-100 rounded-xl p-2.5 text-center">
                      <p className="text-xs font-semibold text-slate-700">{w.week.split("\n")[0]}</p>
                      <p className="text-sm font-bold text-blue-700 mt-0.5">{w.units} คัน</p>
                      <p className="text-xs text-slate-500">฿{fmt(w.revenue)}</p>
                    </div>
                  ))}
                </div>
                {globalDrillData.allSales.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">ไม่มีข้อมูลในเดือนนี้</p>
                )}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={<Award className="w-4 h-4 text-amber-500" />} title="อันดับยอดขาย" sub="Top Sales Reps" iconBg="bg-amber-50" />
            <div className="flex flex-col gap-2 mt-5">
              {mockSalesLeaderboard.map((s) => (
                <div key={s.rank} className={`flex items-center gap-3 rounded-xl p-3 border ${s.rank <= 3 ? "bg-amber-50/60 border-amber-100" : "bg-slate-50 border-slate-100"}`}>
                  <span className="text-base w-7 text-center flex-shrink-0">{s.badge || <span className="text-xs font-bold text-slate-400">#{s.rank}</span>}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.sales} คัน</p>
                  </div>
                  <p className="text-sm font-bold text-indigo-700 flex-shrink-0">฿{fmtM(s.revenue)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 2: Regional Analysis (Part 6) ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <SectionHeader icon={<MapPin className="w-4 h-4 text-teal-600" />} title="วิเคราะห์ลูกค้าตามภาค" sub="คลิกที่จำนวนลูกค้าเพื่อดูรายชื่อ" iconBg="bg-teal-50" />
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Top region highlight */}
            <div className="lg:col-span-2 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl p-5 text-white flex flex-col justify-between">
              <div>
                <p className="text-teal-100 text-sm font-medium">ภาคที่ซื้อมากสุด</p>
                <p className="text-4xl font-bold mt-1">ภาค{topRegion?.region}</p>
                <p className="text-teal-100 text-sm mt-1">{topRegion?.pct}% จากทั้งหมด</p>
              </div>
              <p className="text-2xl font-bold mt-3">{topRegion?.count} <span className="text-lg text-teal-200">ราย</span></p>
            </div>

            {/* All 4 regions */}
            <div className="lg:col-span-3 grid grid-cols-2 gap-3">
              {regionData.map(({ region, count, pct }) => {
                const c = REGION_COLORS[region];
                return (
                  <div key={region} className={`${c.bg} border ${c.border} rounded-2xl p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-bold ${c.text}`}>ภาค{region}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.bg} ${c.text} border ${c.border}`}>{pct}%</span>
                    </div>
                    <button
                      onClick={() => setRegionModal(region)}
                      className={`text-2xl font-bold ${c.text} hover:underline cursor-pointer`}>
                      {count}
                    </button>
                    <p className={`text-xs ${c.text} opacity-70 mt-0.5`}>ลูกค้า</p>
                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 bg-white/60 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: REGION_COLORS[region].dot }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary row */}
          <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {regionData.map(({ region, count }) => {
              const c = REGION_COLORS[region];
              return (
                <div key={region} className="flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: REGION_COLORS[region].dot }} />
                  <span className="text-slate-600">ภาค{region}</span>
                  <button onClick={() => setRegionModal(region)}
                    className={`font-bold ${c.text} hover:underline ml-auto`}>{count} คน</button>
                </div>
              );
            })}
          </div>

          {/* Contact source breakdown */}
          <div className="mt-5 pt-5 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-pink-50 rounded-xl p-1.5"><span className="text-pink-500 text-sm">📲</span></div>
              <div>
                <p className="text-sm font-bold text-slate-800">ช่องทางที่ลูกค้าติดต่อ</p>
                <p className="text-xs text-slate-400">รวมทั้งหมด {sales.length} ราย</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {contactSourceData.map(({ source, count, pct }) => (
                <div key={source} className={`rounded-2xl p-3.5 border text-center ${CONTACT_SOURCE_COLORS[source]?.replace("text-", "border-").replace("100", "200").split(" ")[0] ?? "border-slate-200"} bg-white`}>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CONTACT_SOURCE_COLORS[source] ?? "bg-slate-100 text-slate-600"}`}>{source}</span>
                  <p className="text-2xl font-bold text-slate-800 mt-2">{count}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{pct}% · คน</p>
                  <div className="mt-2.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-current opacity-30 transition-all duration-500"
                      style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Product Popularity — Model with percentages */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={<Package className="w-4 h-4 text-indigo-600" />} title="สัดส่วนยี่ห้อ" sub="Brand Market Share" iconBg="bg-indigo-50" />
            <div className="h-48 mt-2"><BrandShareChart data={mockBrandShare} /></div>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              {mockBrandShare.map((b) => (
                <div key={b.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                  <span className="truncate">{b.name} <span className="text-slate-400">{b.value}%</span></span>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={<BarChart3 className="w-4 h-4 text-indigo-600" />} title="รุ่นขายดี" sub="Top Selling Models — คลิก % เพื่อดูสัดส่วน" iconBg="bg-indigo-50" />
            <div className="flex flex-col gap-3.5 mt-5">
              {(liveTopModels.length > 0 ? liveTopModels : mockTopModels.map((m, i) => ({ model: m.model, count: m.sold, pct: Math.round(m.sold / mockTopModels.reduce((a, b) => a + b.sold, 0) * 100) }))).map((m, i) => (
                <div key={m.model} className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-6 text-center flex-shrink-0 ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>#{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold text-slate-800">{m.model}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{m.pct}%</span>
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{m.count} คัน</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"
                        style={{ width: `${m.pct}%` }} />
                    </div>
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">รวมทั้งหมด</span>
                <span className="text-sm font-bold text-slate-700">{sales.length > 0 ? sales.length : mockTopModels.reduce((a, b) => a + b.sold, 0)} คัน</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sale Type Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <SectionHeader icon={<BarChart3 className="w-4 h-4 text-violet-600" />} title="สัดส่วนประเภทการขาย" sub="ประเภทสินค้าที่ขายดีสุด — อัปเดตจากข้อมูลจริง" iconBg="bg-violet-50" />
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-52">
              <SaleTypeChart data={saleTypeData} />
            </div>
            <div className="flex flex-col gap-2 justify-center">
              {saleTypeData.map((d) => (
                <div key={d.type} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{d.type}</p>
                    <p className="text-xs text-slate-500">฿{fmtM(d.revenue)}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-700 flex-shrink-0 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">{d.count} คัน</span>
                </div>
              ))}
              <div className="mt-1 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">รวม</span>
                <span className="text-sm font-bold text-slate-700">{saleTypeData.reduce((a, b) => a + b.count, 0)} คัน</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 4: Inventory Health + Payment */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={<Package className="w-4 h-4 text-emerald-600" />} title="สถานะสินค้าคงคลัง (Live)" sub="Inventory Health — real-time" iconBg="bg-emerald-50" />
            <div className="flex items-center gap-6 mt-4">
              <div className="h-44 w-44 flex-shrink-0"><StockStatusChart data={liveStockStatus} /></div>
              <div className="flex flex-col gap-3 flex-1">
                {liveStockStatus.map((s) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.value} คัน</p>
                    </div>
                    <span className="text-sm font-bold text-slate-700">
                      {liveStockStatus.reduce((a, b) => a + b.value, 0) > 0
                        ? Math.round((s.value / liveStockStatus.reduce((a, b) => a + b.value, 0)) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <SectionHeader icon={<DollarSign className="w-4 h-4 text-orange-600" />} title="เปรียบเทียบประเภทชำระ" sub="Cash vs Finance" iconBg="bg-orange-50" />
            <div className="h-52 mt-5"><PaymentTypeChart data={mockPaymentTypes} /></div>
          </div>
        </div>

        {/* Row 5: Individual Staff Performance + Drill-down */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <SectionHeader icon={<User className="w-4 h-4 text-violet-600" />} title="ผลงานรายบุคคล" sub="คลิกแท่งกราฟเพื่อดูรายละเอียดรายเดือน" iconBg="bg-violet-50" />
            <select value={selectedStaff} onChange={(e) => { setSelectedStaff(e.target.value); setDrillMonth(null); }}
              className="border border-slate-200 hover:border-violet-300 rounded-xl px-3.5 py-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500 sm:w-56">
              {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* KPI mini-cards */}
            <div className="flex flex-col gap-3">
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                <p className="text-xs text-violet-500 font-medium">รายได้รวม</p>
                <p className="text-2xl font-bold text-violet-700 mt-0.5">฿{fmtM(staffRevenue)}</p>
                <p className="text-xs text-slate-500 mt-1">{staffRevenue > 0 ? `฿${fmt(staffRevenue)}` : "ยังไม่มีข้อมูล"}</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-xs text-indigo-500 font-medium">จำนวนที่ขายได้</p>
                <p className="text-2xl font-bold text-indigo-700 mt-0.5">{staffUnits} <span className="text-base font-semibold">คัน</span></p>
                <p className="text-xs text-slate-500 mt-1">{staffUnits > 0 ? `เฉลี่ย ฿${fmt(Math.round(staffRevenue / staffUnits))} / คัน` : "ยังไม่มีข้อมูล"}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex-1">
                <p className="text-xs text-slate-500 font-medium mb-2">รุ่นที่ขาย</p>
                {staffModels.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มีข้อมูล</p> : (
                  <div className="flex flex-col gap-1.5">
                    {staffModels.slice(0, 5).map(([model, count]) => (
                      <div key={model} className="flex items-center justify-between">
                        <span className="text-xs text-slate-700 truncate flex-1">{model}</span>
                        <span className="text-xs font-bold text-slate-600 ml-2 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md flex-shrink-0">{count} คัน</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Monthly chart — clickable */}
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold text-slate-600 mb-1">รายได้รายเดือน — {selectedStaff}</p>
              <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                <Calendar className="w-3 h-3" />คลิกที่แท่งกราฟเดือนใดเพื่อดูรายละเอียด
              </p>
              <div className="h-56">
                <StaffRevenueChart
                  data={staffMonthly}
                  onBarClick={(month) => setDrillMonth(drillMonth === month ? null : month)}
                  activeMonth={drillMonth ?? undefined}
                />
              </div>
            </div>
          </div>

          {/* ── Drill-down panel ── */}
          {drillMonth && drillData && (
            <div className="border-t border-amber-100 bg-amber-50/40 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-bold text-slate-800">
                    {selectedStaff} — เดือน {drillMonth}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ขายทั้งหมด {drillData.allSales.length} คัน · รายได้ ฿{fmt(drillData.allSales.reduce((s, a) => s + a.actual_sale, 0))}
                  </p>
                </div>
                <button onClick={() => setDrillMonth(null)}
                  className="text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl p-2 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {drillData.allSales.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Calendar className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">ไม่มีข้อมูลการขายในเดือนนี้</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <p className="text-xs font-semibold text-slate-600 mb-3">ยอดขายรายสัปดาห์</p>
                    <div className="h-44 bg-white rounded-xl border border-amber-100 p-3">
                      <WeeklyBreakdownChart data={drillData.weeks.map((w) => ({ week: w.week.split("\n")[0], revenue: w.revenue, units: w.units }))} />
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                      {drillData.weeks.map((week, wi) => week.sales.length > 0 && (
                        <div key={wi} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700">{week.week.split("\n")[0]}</span>
                            <span className="text-xs text-slate-500">฿{fmt(week.revenue)} · {week.units} คัน</span>
                          </div>
                          {week.sales.map((s) => (
                            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800">{s.forklift_unit_no} — {s.forklift_brand} {s.forklift_model}</p>
                                <p className="text-xs text-slate-500 truncate">{s.customer_name} · {s.province}</p>
                              </div>
                              <p className="text-xs font-bold text-indigo-700 flex-shrink-0">฿{fmt(s.actual_sale)}</p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-3">รุ่นที่ขายในเดือนนี้ (มากไปน้อย)</p>
                    <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col gap-3">
                      {drillModels.length === 0 ? (
                        <p className="text-xs text-slate-400">ไม่มีข้อมูล</p>
                      ) : (
                        drillModels.map(([model, count], i) => (
                          <div key={model} className="flex items-center gap-3">
                            <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${i === 0 ? "text-amber-500" : "text-slate-400"}`}>#{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{model}</p>
                              <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                                  style={{ width: `${(count / drillModels[0][1]) * 100}%` }} />
                              </div>
                            </div>
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg flex-shrink-0">{count} คัน</span>
                          </div>
                        ))
                      )}
                      <div className="mt-2 pt-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-600 mb-1">สรุปเดือน {drillMonth}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                            <p className="text-xs text-amber-600">รวมขาย</p>
                            <p className="text-base font-bold text-amber-700">{drillData.allSales.length} คัน</p>
                          </div>
                          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2.5">
                            <p className="text-xs text-indigo-600">รายได้รวม</p>
                            <p className="text-base font-bold text-indigo-700">{fmtM(drillData.allSales.reduce((s, a) => s + a.actual_sale, 0))}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sales detail table */}
          {staffSales.length > 0 && !drillMonth && (
            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">รถ</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">ลูกค้า</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">จังหวัด</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">ชำระ</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">ราคาขาย</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">วันที่</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 text-xs">{s.forklift_unit_no}</p>
                        <p className="text-slate-500 text-xs">{s.forklift_brand} {s.forklift_model}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 max-w-[140px] truncate">{s.customer_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{s.province}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.payment_type === "เงินสด" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {s.payment_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-700 text-sm">฿{fmt(s.actual_sale)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{s.created_at}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-indigo-50 border-t border-indigo-100">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-indigo-700">รวมทั้งหมด</td>
                    <td className="px-4 py-2.5 text-right font-bold text-indigo-800">฿{fmt(staffRevenue)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Regional Customer Modal ── */}
      {regionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setRegionModal(null)}>
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[84vh] flex flex-col shadow-2xl overflow-hidden">
            <div className={`px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0 ${REGION_COLORS[regionModal]?.bg}`}>
              <div>
                <h3 className={`text-base font-bold ${REGION_COLORS[regionModal]?.text}`}>ลูกค้าภาค{regionModal}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{modalSales.length} ราย</p>
              </div>
              <button onClick={() => setRegionModal(null)} className="text-slate-400 hover:text-slate-700 hover:bg-white/60 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
            </div>
            {modalSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Users className="w-10 h-10 mb-2 text-slate-300" />
                <p className="text-sm">ยังไม่มีลูกค้าในภาคนี้</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0 p-4 flex flex-col gap-2">
                {modalSales.map((s) => (
                  <div key={s.id} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-bold text-slate-800 text-sm">{s.customer_name}</p>
                          {s.contact_source && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONTACT_SOURCE_COLORS[s.contact_source] ?? "bg-slate-100 text-slate-600"}`}>{s.contact_source}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 flex items-center gap-1"><span>📞</span>{s.customer_tel}</p>
                        <p className="text-xs text-slate-500 mt-0.5">📍 {s.province}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {s.customer_type && <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{s.customer_type}</span>}
                          {s.sale_type && <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">{s.sale_type}</span>}
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{s.forklift_brand} {s.forklift_model}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-indigo-700 text-sm">฿{fmt(s.actual_sale)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.created_at}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between border-t border-slate-200 mt-2">
        <p className="text-slate-400 text-xs">SalesOS Dashboard — ข้อมูล Mock สำหรับสาธิต</p>
        <Link href="/" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 font-medium transition-colors">
          กลับหน้าหลัก <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </footer>
    </div>
  );
}

function KPICard({ icon, label, value, sub, color, iconBg, accent }: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  color: string; iconBg: string; accent: string;
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 border-l-4 ${accent} p-5 hover:shadow-md transition-shadow`}>
      <div className={`${iconBg} rounded-xl p-2 w-fit mb-3 text-white`}>{icon}</div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-xl font-bold ${color} leading-tight mt-0.5`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function SectionHeader({ icon, title, sub, iconBg }: { icon: React.ReactNode; title: string; sub: string; iconBg: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`${iconBg} rounded-xl p-2`}>{icon}</div>
      <div>
        <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
        <p className="text-xs text-slate-500">{sub}</p>
      </div>
    </div>
  );
}
