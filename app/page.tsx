"use client";

import Link from "next/link";
import { Truck, Package, TrendingUp, BarChart3, ArrowRight, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorative circles */}
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-120px] left-[-80px] w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="text-center mb-12 relative z-10">
        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-1.5 mb-6">
          <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          <span className="text-white/80 text-xs font-medium">Forklift Management Platform</span>
        </div>
        <div className="flex items-center justify-center gap-4 mb-3">
          <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-2xl p-3 shadow-lg shadow-yellow-500/30">
            <Truck className="w-9 h-9 text-slate-900" />
          </div>
          <div className="text-left">
            <h1 className="text-5xl font-bold text-white tracking-tight">SalesOS</h1>
            <p className="text-indigo-300 text-sm font-medium mt-0.5">ระบบจัดการรถโฟล์คลิฟท์</p>
          </div>
        </div>
        <p className="text-slate-400 text-base mt-4">เลือกบทบาทของคุณเพื่อเริ่มต้นใช้งาน</p>
      </div>

      {/* Role Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-6 relative z-10">
        {/* Transporter */}
        <Link href="/transporter/login" className="group block">
          <div className="bg-white/[0.07] hover:bg-white/[0.13] backdrop-blur-md border border-white/10 hover:border-yellow-400/50 rounded-2xl p-6 flex flex-col items-center gap-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-yellow-500/10 cursor-pointer">
            <div className="bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl p-4 shadow-lg shadow-yellow-500/30 group-hover:shadow-yellow-500/50 group-hover:scale-105 transition-all duration-300">
              <Truck className="w-8 h-8 text-slate-900" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-white">ผู้ขนส่ง</h2>
              <p className="text-xs text-slate-400 mt-1">Delivery</p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">ตรวจสอบและบันทึกสภาพรถที่รับมอบ</p>
            </div>
            <div className="mt-auto flex items-center gap-1.5 bg-yellow-400 hover:bg-yellow-300 text-slate-900 text-sm font-semibold px-5 py-2 rounded-full transition-all duration-200 group-hover:gap-2.5 w-full justify-center">
              เข้าสู่ระบบ <ArrowRight className="w-3.5 h-3.5 transition-all" />
            </div>
          </div>
        </Link>

        {/* Stock Manager */}
        <Link href="/stock/login" className="group block">
          <div className="bg-white/[0.07] hover:bg-white/[0.13] backdrop-blur-md border border-white/10 hover:border-emerald-400/50 rounded-2xl p-6 flex flex-col items-center gap-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/10 cursor-pointer">
            <div className="bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl p-4 shadow-lg shadow-emerald-500/30 group-hover:shadow-emerald-500/50 group-hover:scale-105 transition-all duration-300">
              <Package className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-white">ฝ่ายสต็อก</h2>
              <p className="text-xs text-slate-400 mt-1">Stock Manager</p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">จัดการสินค้าคงคลังและเพิ่มรถใหม่</p>
            </div>
            <div className="mt-auto flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-semibold px-5 py-2 rounded-full transition-all duration-200 group-hover:gap-2.5 w-full justify-center">
              เข้าสู่ระบบ <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </Link>

        {/* Sales Team */}
        <Link href="/sales/login" className="group block">
          <div className="bg-white/[0.07] hover:bg-white/[0.13] backdrop-blur-md border border-white/10 hover:border-indigo-400/50 rounded-2xl p-6 flex flex-col items-center gap-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/10 cursor-pointer">
            <div className="bg-gradient-to-br from-indigo-500 to-blue-700 rounded-2xl p-4 shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 group-hover:scale-105 transition-all duration-300">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold text-white">ทีมขาย</h2>
              <p className="text-xs text-slate-400 mt-1">Sales Team</p>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">ดูสต็อกและปิดการขาย</p>
            </div>
            <div className="mt-auto flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-5 py-2 rounded-full transition-all duration-200 group-hover:gap-2.5 w-full justify-center">
              เข้าสู่ระบบ <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </Link>
      </div>

      {/* Dashboard Link */}
      <Link href="/dashboard" className="group relative z-10">
        <div className="bg-white/[0.06] hover:bg-white/[0.12] backdrop-blur-md border border-white/10 hover:border-white/25 rounded-2xl px-7 py-4 flex items-center gap-4 transition-all duration-300 cursor-pointer">
          <div className="bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl p-2.5">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-white font-semibold text-base">แดชบอร์ดวิเคราะห์</span>
            <p className="text-slate-400 text-xs mt-0.5">ดูสถิติการขาย รายได้ และรายงาน</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all duration-200 ml-2" />
        </div>
      </Link>

      <p className="text-slate-600 text-xs mt-10 relative z-10">© 2024 SalesOS — Forklift Sales &amp; Inventory Management</p>
    </div>
  );
}
