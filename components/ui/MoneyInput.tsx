"use client";
import React from "react";

// ── ตัวช่วยจัดรูปแบบเงิน ใส่ลูกน้ำหลักพัน (30000 → 30,000) ─────────────────────
// เก็บค่าใน state/DB เป็น "ตัวเลขล้วน" (ไม่มีลูกน้ำ) เหมือนเดิม → โค้ดบันทึก/คำนวณไม่ต้องแก้

/** ตัวเลขล้วน → ข้อความมีลูกน้ำ (รองรับทศนิยม 1 จุด + ค่าติดลบ) */
export function formatMoney(raw: string | number | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (s === "" || s === "-") return s;
  const neg = s.startsWith("-");
  const cleaned = s.replace(/[^\d.]/g, "");
  if (cleaned === "") return "";
  const dot = cleaned.indexOf(".");
  const intPart = dot === -1 ? cleaned : cleaned.slice(0, dot);
  const dec = dot === -1 ? "" : cleaned.slice(dot + 1).replace(/\./g, ""); // รวมจุดเกินเป็นทศนิยมเดียว
  const grouped = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = dot === -1 ? grouped : `${grouped}.${dec}`;
  return neg ? `-${body}` : body;
}

/** ข้อความ (มีลูกน้ำ/ตัวอักษร) → ตัวเลขล้วนสำหรับเก็บ state */
export function parseMoney(display: string): string {
  const neg = /^\s*-/.test(display);
  let cleaned = display.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot !== -1) cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, ""); // เหลือจุดเดียว
  return cleaned ? (neg ? `-${cleaned}` : cleaned) : "";
}

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string | number | null | undefined;
  onChange: (raw: string) => void; // ส่งกลับเป็นตัวเลขล้วน (ไม่มีลูกน้ำ)
};

/** ช่องกรอกเงิน — โชว์ลูกน้ำอัตโนมัติ แต่ส่งค่ากลับเป็นตัวเลขล้วน */
export function MoneyInput({ value, onChange, ...rest }: Props) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={formatMoney(value)}
      onChange={e => onChange(parseMoney(e.target.value))}
    />
  );
}
