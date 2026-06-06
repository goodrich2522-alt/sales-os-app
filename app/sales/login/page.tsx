"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, ArrowLeft, User, Lock, Eye, EyeOff, ArrowRight, UserCircle } from "lucide-react";
import Link from "next/link";
import { mockSalesUsers } from "@/lib/mockData";

export default function SalesLogin() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [usernameVal, setUsernameVal] = useState("");
  const [isFirstTime, setIsFirstTime] = useState(false);   // show name field?
  const [registeredName, setRegisteredName] = useState(""); // name from localStorage
  const router = useRouter();

  // When username changes, check if we have a registered name in localStorage
  useEffect(() => {
    if (!usernameVal.trim()) { setIsFirstTime(false); setRegisteredName(""); return; }
    const stored = typeof window !== "undefined"
      ? localStorage.getItem(`salesos_name_${usernameVal.trim()}`)
      : null;
    if (stored) {
      setIsFirstTime(false);
      setRegisteredName(stored);
    } else {
      setIsFirstTime(true);
      setRegisteredName("");
    }
  }, [usernameVal]);

  // Use FormData to read actual DOM values at submission time — fixes autofill/timing bug
  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const u = String(fd.get("username") ?? "").trim();
    const p = String(fd.get("password") ?? "").trim();
    const nameField = String(fd.get("displayname") ?? "").trim();

    const user = mockSalesUsers.find((x) => x.username === u && x.password === p);
    if (!user) { setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"); return; }

    // Determine display name: typed > localStorage > mockUser default
    const resolvedName = nameField || registeredName || user.name;

    // Save name to localStorage for future logins
    if (nameField) localStorage.setItem(`salesos_name_${u}`, nameField);

    sessionStorage.setItem("sales_user", JSON.stringify({ ...user, name: resolvedName }));
    router.push("/sales/main");
  };

  const ib = (hasErr: boolean) =>
    `w-full py-3 border rounded-xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 ${hasErr ? "border-red-300 bg-red-50" : "border-slate-200 hover:border-slate-300 bg-white"}`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-8 text-sm font-medium transition-colors duration-200 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform duration-200" />
          กลับหน้าหลัก
        </Link>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/80 border border-slate-100 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-blue-600" />
          <div className="p-8">
            <div className="flex flex-col items-center mb-7">
              <div className="bg-gradient-to-br from-indigo-500 to-blue-700 rounded-2xl p-4 mb-4 shadow-lg shadow-indigo-200">
                <TrendingUp className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">ทีมขาย</h1>
              <p className="text-slate-500 text-sm mt-1 text-center">เข้าสู่ระบบเพื่อดูสต็อกและปิดการขาย</p>
              <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2 text-xs text-indigo-700 font-medium text-center">
                ทดสอบ: sales01 / 1234
              </div>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              {/* Username */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อผู้ใช้</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    name="username"
                    type="text"
                    autoComplete="username"
                    value={usernameVal}
                    onChange={(e) => { setUsernameVal(e.target.value); setError(""); }}
                    placeholder="กรอกชื่อผู้ใช้..."
                    className={`${ib(false)} pl-10 pr-4`}
                  />
                </div>
              </div>

              {/* Password */}
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

              {/* Name field — first-time login only */}
              {isFirstTime && usernameVal.trim() && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCircle className="w-4 h-4 text-indigo-500" />
                    <p className="text-sm font-semibold text-indigo-700">ลงทะเบียนชื่อครั้งแรก</p>
                  </div>
                  <p className="text-xs text-indigo-600 mb-3">ระบบจะจดจำชื่อนี้สำหรับ <strong>{usernameVal}</strong> ในการล็อกอินครั้งต่อไป</p>
                  <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                    <input
                      name="displayname"
                      type="text"
                      placeholder="กรอกชื่อ-นามสกุล..."
                      className="w-full pl-9 pr-4 py-2.5 border border-indigo-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white transition-all duration-200"
                    />
                  </div>
                </div>
              )}

              {/* Returning user - show name */}
              {registeredName && !isFirstTime && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                  <UserCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-emerald-600">ยินดีต้อนรับกลับ</p>
                    <p className="text-sm font-bold text-emerald-800">{registeredName}</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button type="submit"
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-700 hover:from-indigo-500 hover:to-blue-600 text-white font-bold py-3 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md flex items-center justify-center gap-2 text-sm mt-1">
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
