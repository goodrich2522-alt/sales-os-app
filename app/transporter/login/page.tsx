"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Truck, ArrowLeft, User, Phone, ArrowRight } from "lucide-react";
import Link from "next/link";

// หน้าผู้ขนส่ง — จงใจ "ไม่ต้องล็อกอินด้วยอีเมล" เพราะผู้ขนส่งบางคนไม่ถนัดเทคโนโลยี
// ใส่แค่ ชื่อเล่น + เบอร์โทร (บังคับทั้ง 2 ค่า) · ไม่ผูกกับ Supabase Auth
// หมายเหตุ: ก่อนเปิด RLS ถาวร ต้องเพิ่ม write path สำหรับหน้านี้ (ดู DEV-PLAN)
export default function TransporterLogin() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  // จำไว้แล้ว → เข้าหน้าหลักเลย
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("transporter_name")) router.replace("/transporter/main");
  }, [router]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const p = phone.trim();
    if (!n) { setError("กรุณากรอกชื่อเล่น"); return; }
    // เบอร์โทร: ตัวเลข 9–10 หลัก (อนุญาตเว้นวรรค/ขีดตอนพิมพ์ แต่เก็บเฉพาะตัวเลข)
    const digits = p.replace(/[^0-9]/g, "");
    if (!p) { setError("กรุณากรอกเบอร์โทร"); return; }
    if (digits.length < 9 || digits.length > 10) { setError("เบอร์โทรไม่ถูกต้อง (ต้องมี 9–10 หลัก)"); return; }
    localStorage.setItem("transporter_name", n);
    localStorage.setItem("transporter_phone", digits);
    router.push("/transporter/main");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 text-sm font-medium transition-colors duration-200 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" />
          กลับหน้าหลัก
        </Link>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-100 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-yellow-400 to-amber-500" />

          <div className="p-8">
            <div className="flex flex-col items-center mb-8">
              <div className="bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl p-4 mb-4 shadow-lg shadow-yellow-200">
                <Truck className="w-10 h-10 text-slate-900" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">ผู้ขนส่ง</h1>
              <p className="text-slate-500 text-sm mt-1 text-center">กรอกชื่อเล่นกับเบอร์โทรเพื่อเริ่มใช้งาน</p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อเล่น <span className="text-red-500">*</span></label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={name} onChange={(e) => { setName(e.target.value); setError(""); }}
                    placeholder="เช่น สมปอง"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">เบอร์โทร <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input value={phone} onChange={(e) => { setPhone(e.target.value); setError(""); }}
                    type="tel" inputMode="numeric"
                    placeholder="เช่น 0812345678"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent bg-white transition-all" />
                </div>
              </div>

              {error && (
                <p className="text-red-500 text-xs flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />{error}
                </p>
              )}

              <button type="submit"
                className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-900 font-bold py-3 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md flex items-center justify-center gap-2 text-sm mt-1">
                เข้าใช้งาน <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">ไม่ต้องใช้อีเมล — กรอกชื่อเล่นกับเบอร์โทรเท่านั้น</p>
      </div>
    </div>
  );
}
