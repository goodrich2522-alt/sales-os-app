"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Truck, ArrowLeft, User, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function TransporterLogin() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  // จำชื่อไว้ — ถ้าเคยกรอกแล้วยังไม่ออก เข้าหน้าหลักเลย
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("transporter_name")) router.replace("/transporter/main");
  }, [router]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) { setError("กรุณากรอกชื่อ"); return; }
    localStorage.setItem("transporter_name", username.trim());
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
              <p className="text-slate-500 text-sm mt-1 text-center">เข้าสู่ระบบเพื่อบันทึกการรับมอบรถ</p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อของคุณ</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(""); }}
                    placeholder="กรอกชื่อของคุณ..."
                    className={`w-full pl-10 pr-4 py-3 border rounded-xl text-slate-800 text-sm placeholder:text-slate-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent ${error ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300 bg-white"}`}
                  />
                </div>
                {error && (
                  <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-red-500 inline-block" />
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-900 font-bold py-3 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md flex items-center justify-center gap-2 text-sm"
              >
                เข้าสู่ระบบ
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">ไม่ต้องใช้รหัสผ่าน — กรอกชื่อเท่านั้น</p>
      </div>
    </div>
  );
}
