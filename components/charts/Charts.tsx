"use client";

import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Sale } from "@/lib/types";

const TT: React.CSSProperties = {
  backgroundColor: "#1e293b",
  border: "none",
  borderRadius: "10px",
  color: "#f1f5f9",
  fontSize: "12px",
  padding: "8px 12px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
};

function fmt(n: number) { return Number(n).toLocaleString("th-TH"); }

// ─── 1. Monthly Revenue Bar Chart ─────────────────────────────────────────────
interface RevenueData { month: string; revenue: number; units: number; }
export function SalesRevenueChart({
  data,
  onBarClick,
  activeMonth,
}: {
  data: RevenueData[];
  onBarClick?: (month: string) => void;
  activeMonth?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.85} />
          </linearGradient>
          <linearGradient id="revenueGradActive" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
            <stop offset="100%" stopColor="#f97316" stopOpacity={0.9} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}ล`} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => [`฿${fmt(Number(v))}`, "รายได้"]} contentStyle={TT} cursor={{ fill: "#f8fafc" }} />
        <Bar dataKey="revenue" radius={[6, 6, 0, 0]} cursor={onBarClick ? "pointer" : "default"}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick={(d: any) => onBarClick?.(d?.month ?? "")}>
          {data.map((entry) => (
            <Cell key={entry.month} fill={entry.month === activeMonth ? "url(#revenueGradActive)" : "url(#revenueGrad)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 2. Brand Doughnut Chart ───────────────────────────────────────────────────
interface BrandData { name: string; value: number; color: string; }
export function BrandShareChart({ data }: { data: BrandData[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={80}
          dataKey="value" paddingAngle={3} strokeWidth={2} stroke="#fff">
          {data.map((entry, i) => <Cell key={`brand-${i}`} fill={entry.color} />)}
        </Pie>
        <Tooltip formatter={(v) => [`${v}%`, "สัดส่วน"]} contentStyle={TT} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── 3. Stock Status Pie Chart ─────────────────────────────────────────────────
interface StockData { name: string; value: number; color: string; }
export function StockStatusChart({ data }: { data: StockData[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={80}
          dataKey="value" paddingAngle={3} strokeWidth={2} stroke="#fff">
          {data.map((entry, i) => <Cell key={`stock-${i}`} fill={entry.color} />)}
        </Pie>
        <Tooltip formatter={(v) => [`${v} คัน`]} contentStyle={TT} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── 4. Payment Comparison Bar Chart ──────────────────────────────────────────
interface PayData { month: string; cash: number; finance: number; }
export function PaymentTypeChart({ data }: { data: PayData[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TT} />
        <Legend iconType="circle" iconSize={8}
          formatter={(v) => <span style={{ fontSize: "12px", color: "#64748b" }}>{v === "cash" ? "เงินสด" : "ไฟแนนซ์"}</span>}
        />
        <Bar dataKey="cash"    fill="#10b981" name="cash"    radius={[4, 4, 0, 0]} />
        <Bar dataKey="finance" fill="#f59e0b" name="finance" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 5. Individual Staff Revenue Chart (clickable bars) ───────────────────────
interface StaffSalePoint { month: string; revenue: number; }
export function StaffRevenueChart({
  data,
  onBarClick,
  activeMonth,
}: {
  data: StaffSalePoint[];
  onBarClick?: (month: string) => void;
  activeMonth?: string;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        ไม่มีข้อมูลการขายของพนักงานคนนี้
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="staffGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.8} />
          </linearGradient>
          <linearGradient id="staffGradActive" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
            <stop offset="100%" stopColor="#f97316" stopOpacity={0.9} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}ล`} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v) => [`฿${fmt(Number(v))}`, "รายได้"]}
          contentStyle={TT}
          cursor={{ fill: "#f8fafc" }}
        />
        <Bar
          dataKey="revenue"
          radius={[6, 6, 0, 0]}
          cursor={onBarClick ? "pointer" : "default"}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onClick={(d: any) => onBarClick?.(d?.month ?? "")}
        >
          {data.map((entry) => (
            <Cell
              key={entry.month}
              fill={entry.month === activeMonth ? "url(#staffGradActive)" : "url(#staffGrad)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 6. Weekly Breakdown Chart (for drill-down) ────────────────────────────────
interface WeekPoint { week: string; revenue: number; units: number; }
export function WeeklyBreakdownChart({ data }: { data: WeekPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="weekGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
            <stop offset="100%" stopColor="#f97316" stopOpacity={0.85} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}ล`} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v, name) => name === "revenue" ? [`฿${fmt(Number(v))}`, "รายได้"] : [v, "จำนวน (คัน)"]}
          contentStyle={TT}
          cursor={{ fill: "#fef9ec" }}
        />
        <Bar dataKey="revenue" fill="url(#weekGrad)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 7. Sale Type Bar Chart ───────────────────────────────────────────────────
interface SaleTypeData { type: string; count: number; revenue: number; color: string; }
export function SaleTypeChart({ data }: { data: SaleTypeData[] }) {
  if (!data.length) {
    return <div className="flex items-center justify-center h-full text-slate-400 text-sm">ไม่มีข้อมูล</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="type" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v, name) => name === "count" ? [`${v} คัน`, "จำนวน"] : [`฿${fmt(Number(v))}`, "รายได้"]}
          contentStyle={TT}
          cursor={{ fill: "#f8fafc" }}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function buildStaffMonthly(sales: Sale[], staffName: string): StaffSalePoint[] {
  const map: Record<string, number> = {};
  MONTH_LABELS.forEach((m) => (map[m] = 0));
  sales
    .filter((s) => s.sales_staff === staffName)
    .forEach((s) => {
      const monthIdx = new Date(s.created_at).getMonth();
      const label = MONTH_LABELS[monthIdx] ?? "ม.ค.";
      map[label] = (map[label] ?? 0) + s.actual_sale;
    });
  return MONTH_LABELS.map((m) => ({ month: m, revenue: map[m] }));
}

export interface WeeklyDrilldown {
  weeks: { week: string; revenue: number; units: number; sales: Sale[] }[];
  allSales: Sale[];
}

export function buildAllMonthlyWeekly(sales: Sale[], monthLabel: string): WeeklyDrilldown {
  const monthIdx = MONTH_LABELS.indexOf(monthLabel);
  const filtered = sales.filter((s) => new Date(s.created_at).getMonth() === monthIdx);
  const weeks = [
    { week: "สัปดาห์ 1\n(1-7)", revenue: 0, units: 0, sales: [] as Sale[] },
    { week: "สัปดาห์ 2\n(8-14)", revenue: 0, units: 0, sales: [] as Sale[] },
    { week: "สัปดาห์ 3\n(15-21)", revenue: 0, units: 0, sales: [] as Sale[] },
    { week: "สัปดาห์ 4\n(22-31)", revenue: 0, units: 0, sales: [] as Sale[] },
  ];
  filtered.forEach((s) => {
    const day = new Date(s.created_at).getDate();
    const wIdx = Math.min(Math.floor((day - 1) / 7), 3);
    weeks[wIdx].revenue += s.actual_sale;
    weeks[wIdx].units   += 1;
    weeks[wIdx].sales.push(s);
  });
  return { weeks, allSales: filtered };
}

export function buildStaffWeekly(sales: Sale[], staffName: string, monthLabel: string): WeeklyDrilldown {
  const monthIdx = MONTH_LABELS.indexOf(monthLabel);
  const filtered = sales.filter((s) => {
    if (s.sales_staff !== staffName) return false;
    return new Date(s.created_at).getMonth() === monthIdx;
  });

  const weeks = [
    { week: "สัปดาห์ 1\n(1-7)", revenue: 0, units: 0, sales: [] as Sale[] },
    { week: "สัปดาห์ 2\n(8-14)", revenue: 0, units: 0, sales: [] as Sale[] },
    { week: "สัปดาห์ 3\n(15-21)", revenue: 0, units: 0, sales: [] as Sale[] },
    { week: "สัปดาห์ 4\n(22-31)", revenue: 0, units: 0, sales: [] as Sale[] },
  ];

  filtered.forEach((s) => {
    const day = new Date(s.created_at).getDate();
    const wIdx = Math.min(Math.floor((day - 1) / 7), 3);
    weeks[wIdx].revenue += s.actual_sale;
    weeks[wIdx].units   += 1;
    weeks[wIdx].sales.push(s);
  });

  return { weeks, allSales: filtered };
}
