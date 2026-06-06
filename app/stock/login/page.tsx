"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Package, ArrowLeft, User, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import Link from "next/link";
import { mockStockUsers } from "@/lib/mockData";

export default function StockLogin() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Use FormData to read actual DOM values — avoids React state timing / autofill bug
  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const u = String(fd.get("username") ?? "").trim();
    const p = String(fd.get("password") ?? "").trim();

    const user = mockStockUsers.find((x) => x.username === u && x.password === p);
    if (user) {
      sessionStorage.setItem("stock_user", JSON.stringify(user));
      router.push("/stock/main");
    } else {
      setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }
  };

  const ib = (hasErr: boolean) =>
    `w-full py-3 border rounded-xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 ${hasErr ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300 bg-white"}`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 text-sm font-medium transition-colors duration-200 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" />
          กลับหน้าหลัก
        </Link>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-100 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-emerald-400 to-green-600" />
          <div className="p-8">
            <div className="flex flex-col items-center mb-8">
              <div className="bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl p-4 mb-4 shadow-lg shadow-emerald-200">
                <Package className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">ฝ่ายสต็อก</h1>
              <p className="text-slate-500 text-sm mt-1 text-center">เข้าสู่ระบบจัดการสินค้าคงคลัง</p>
              <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 text-xs text-emerald-700 font-medium">
                ทดสอบ: stock01 / 1234
              </div>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อผู้ใช้</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="username"
                    type="text"
                    autoComplete="username"
                    onChange={() => setError("")}
                    placeholder="กรอกชื่อผู้ใช้..."
                    className={`${ib(false)} pl-10 pr-4`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">รหัสผ่าน</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    onChange={() => setError("")}
                    placeholder="กรอกรหัสผ่าน..."
                    className={`${ib(!!error)} pl-10 pr-11`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button type="submit"
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold py-3 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md flex items-center justify-center gap-2 text-sm">
                เข้าสู่ระบบ
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
