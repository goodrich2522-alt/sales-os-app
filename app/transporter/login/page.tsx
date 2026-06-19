"use client";

import { useRouter } from "next/navigation";
import { Truck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import GoogleLoginButton, { type GoogleUser } from "@/components/GoogleLoginButton";

export default function TransporterLogin() {
  const router = useRouter();

  const handleGoogle = (u: GoogleUser) => {
    sessionStorage.setItem("transporter_name", u.name);
    sessionStorage.setItem("transporter_email", u.email);
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

            <div className="flex flex-col items-center gap-3">
              <GoogleLoginButton onSuccess={handleGoogle} />
              <p className="text-xs text-slate-400 text-center">เข้าสู่ระบบด้วยบัญชี Google ของคุณ</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
