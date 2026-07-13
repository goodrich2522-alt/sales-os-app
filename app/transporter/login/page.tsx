"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Truck, ArrowLeft, UserCircle, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import GoogleLoginButton, { type GoogleUser } from "@/components/GoogleLoginButton";
import { checkAccess, rememberKnownUser, ROLE_LABELS } from "@/lib/auth";

export default function TransporterLogin() {
  const router = useRouter();
  const [pending, setPending] = useState<GoogleUser | null>(null); // เข้าครั้งแรก รอกรอกชื่อ
  const [nameInput, setNameInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState(""); // ข้อความแจ้งสถานะ (รออนุมัติ/ถูกระงับ/role ไม่ตรง)

  // ล็อกอินค้างไว้แล้ว → เข้าหน้าหลักเลย
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("transporter_name")) router.replace("/transporter/main");
  }, [router]);

  const finish = (name: string) => {
    localStorage.setItem("transporter_name", name);
    router.push("/transporter/main");
  };

  const handleGoogle = async (u: GoogleUser) => {
    setChecking(true); setNotice("");
    const access = await checkAccess(u.email, "transporter");
    setChecking(false);
    if (access.ok) { finish(access.user?.name || u.name); return; }
    if (access.reason === "unknown") { setPending(u); setNameInput(u.name || ""); return; } // ผู้ใช้ใหม่ → ลงทะเบียนรออนุมัติ
    if (access.reason === "pending") setNotice("บัญชีของคุณลงทะเบียนแล้ว — รอแอดมินอนุมัติก่อนจึงจะเข้าใช้งานได้");
    else if (access.reason === "blocked") setNotice("บัญชีนี้ถูกระงับการใช้งาน — ติดต่อแอดมินหากคิดว่าผิดพลาด");
    else if (access.reason === "role_mismatch") setNotice(`บัญชีนี้ได้รับสิทธิ์ "${ROLE_LABELS[access.user?.role ?? ""] ?? access.user?.role}" — เข้าหน้าผู้ขนส่งไม่ได้ (แอดมินเปลี่ยนบทบาทให้ได้)`);
  };

  const confirmName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pending || !nameInput.trim()) return;
    // ผู้ใช้ใหม่ = รออนุมัติก่อน ยังเข้าไม่ได้จนกว่าแอดมินจะกดอนุมัติที่ /admin/users
    await rememberKnownUser(pending.email, nameInput.trim(), "transporter", "pending");
    setPending(null);
    setNotice("ลงทะเบียนเรียบร้อย — รอแอดมินอนุมัติ แล้วค่อยล็อกอินเข้าใหม่อีกครั้ง");
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
            <div className="flex flex-col items-center mb-7">
              <div className="bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl p-4 mb-4 shadow-lg shadow-yellow-200">
                <Truck className="w-10 h-10 text-slate-900" />
              </div>
              <h1 className="text-2xl font-bold text-slate-800">ผู้ขนส่ง</h1>
              <p className="text-slate-500 text-sm mt-1 text-center">เข้าสู่ระบบเพื่อบันทึกการรับ-ส่งมอบรถ</p>
            </div>

            {pending ? (
              /* ── เข้าครั้งแรก: ลงทะเบียนชื่อ ── */
              <form onSubmit={confirmName} className="flex flex-col gap-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700">
                  เชื่อมบัญชี <strong>{pending.email}</strong> แล้ว — กรอกชื่อที่จะใช้แสดงในระบบ
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">ชื่อของคุณ</label>
                  <div className="relative">
                    <UserCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input autoFocus value={nameInput} onChange={(e) => setNameInput(e.target.value)}
                      placeholder="เช่น สมปอง"
                      className="w-full pl-10 pr-4 py-3 border border-slate-200 hover:border-slate-300 rounded-xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white transition-all" />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">ลงทะเบียนแล้วต้องรอแอดมินอนุมัติก่อน จึงจะเข้าใช้งานได้</p>
                </div>
                <button type="submit" disabled={!nameInput.trim()}
                  className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 disabled:opacity-40 text-slate-900 font-bold py-3 rounded-xl transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 text-sm">
                  ลงทะเบียน (รอแอดมินอนุมัติ) <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              /* ── ปุ่ม Google ── */
              <div className="flex flex-col items-center gap-3">
                {notice && (
                  <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
                    {notice}
                  </div>
                )}
                {checking ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm py-2"><Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบ...</div>
                ) : (
                  <GoogleLoginButton onSuccess={handleGoogle} onError={setNotice} />
                )}
                <p className="text-xs text-slate-400 text-center">เข้าสู่ระบบด้วยบัญชี Google ของคุณ</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
