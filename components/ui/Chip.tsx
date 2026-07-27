// components/ui/Chip.tsx — แท็กกดได้ (ใช้เป็นตัวกรอง) ที่ใช้ร่วมทั้งแอป (เฟส 1)
import type { ReactNode } from "react";

/** ชิปกดเลือก — active = ไฮไลต์ · แสดงจำนวนกำกับได้ (count) */
export function Chip({
  label, active, onClick, count, icon,
}: {
  label: ReactNode;
  active?: boolean;
  onClick?: () => void;
  count?: number;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition
        ${active
          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
          : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"}`}
    >
      {icon}
      <span>{label}</span>
      {count != null && (
        <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none
          ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>
          {count}
        </span>
      )}
    </button>
  );
}
