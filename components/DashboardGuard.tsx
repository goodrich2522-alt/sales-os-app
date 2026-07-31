"use client";
// components/DashboardGuard.tsx — ปิดกั้นหน้าแดชบอร์ด/รายงานให้เข้าได้เฉพาะ แอดมิน + ฝ่ายสต็อก
// (ทีมขาย/ผู้ขนส่ง เข้าไม่ได้ — กันดูข้อมูลรวม/ต้นทุน/ค่าคอม) · ตรวจจาก session Google จริง
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { checkAccess } from "@/lib/auth";
import { apiEnabled } from "@/lib/api";

export function DashboardGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "denied">(apiEnabled ? "checking" : "ok");

  useEffect(() => {
    if (!apiEnabled || !supabase) { setState("ok"); return; }
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      if (!email) { setState("denied"); return; }
      const acc = await checkAccess(email, "stock"); // แอดมิน (bypass) หรือ role=stock เท่านั้น
      setState(acc.ok ? "ok" : "denied");
    })();
  }, []);

  if (state === "checking")
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">กำลังตรวจสอบสิทธิ์...</div>;
  if (state === "denied")
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-500 p-6 text-center bg-slate-50">
        <div className="text-4xl">🔒</div>
        <p className="font-bold text-slate-700">เข้าถึงหน้านี้ไม่ได้</p>
        <p className="text-sm">หน้ารายงาน/แดชบอร์ด สำหรับ <b>ฝ่ายสต็อก / แอดมิน</b> เท่านั้น</p>
        <button onClick={() => router.push("/")} className="mt-2 text-indigo-600 hover:text-indigo-800 font-semibold text-sm">← กลับหน้าหลัก</button>
      </div>
    );
  return <>{children}</>;
}
