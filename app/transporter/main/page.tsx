"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Upload, X, CheckCircle, Truck, Camera, AlertCircle, LogOut, ChevronRight } from "lucide-react";
import { mockTransporterData } from "@/lib/mockData";
import { useApp } from "@/lib/AppContext";

interface ForkliftInfo {
  brand: string;
  model: string;
  capacity: string;
  fuel: string;
  color: string;
}

export default function TransporterMain() {
  const router = useRouter();
  const { addInspection } = useApp();
  const [username, setUsername] = useState("");
  const [unitNo, setUnitNo] = useState("");
  const [forkliftInfo, setForkliftInfo] = useState<ForkliftInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const name = sessionStorage.getItem("transporter_name");
    if (!name) router.push("/transporter/login");
    else setUsername(name);
  }, [router]);

  const handleSearch = () => {
    if (!unitNo.trim()) return;
    setIsLoading(true);
    setNotFound(false);
    setForkliftInfo(null);
    setTimeout(() => {
      const data = mockTransporterData[unitNo.trim().toUpperCase()];
      if (data) setForkliftInfo(data);
      else setNotFound(true);
      setIsLoading(false);
    }, 800);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setImages((prev) => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = () => {
    // Save inspection record to global context → visible in /dashboard/inspections
    addInspection({
      id: `ins_${Date.now()}`,
      unit_no: unitNo.trim().toUpperCase(),
      transporter_name: username,
      date: new Date().toISOString().slice(0, 10),
      images: [...images],
    });
    setSubmitted(true);
    setTimeout(() => { setUnitNo(""); setForkliftInfo(null); setImages([]); setSubmitted(false); }, 3000);
  };

  const handleLogout = () => { sessionStorage.removeItem("transporter_name"); router.push("/transporter/login"); };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-yellow-400 to-amber-500 rounded-xl p-2">
              <Truck className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-sm leading-tight">ผู้ขนส่ง</p>
              <p className="text-slate-500 text-xs">{username}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 text-sm font-medium transition-colors duration-200 hover:bg-red-50 px-3 py-1.5 rounded-lg">
            <LogOut className="w-4 h-4" />ออกจากระบบ
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Search Unit No */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-500" />
            ค้นหาหมายเลขรถ
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={unitNo}
              onChange={(e) => { setUnitNo(e.target.value); setNotFound(false); setForkliftInfo(null); }}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="กรอกหมายเลขรถ เช่น HEL-001"
              className="flex-1 border border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all duration-200"
            />
            <button onClick={handleSearch} disabled={isLoading}
              className="bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-300 hover:to-amber-400 text-slate-900 font-bold px-5 py-3 rounded-xl transition-all duration-200 active:scale-[0.97] disabled:opacity-60 flex items-center gap-1.5 text-sm shadow-sm">
              {isLoading ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 border-2 border-slate-700/30 border-t-slate-700 rounded-full animate-spin" />
                  กำลังค้นหา
                </span>
              ) : (
                <><Search className="w-4 h-4" />ค้นหา</>
              )}
            </button>
          </div>
          {notFound && (
            <div className="mt-3 flex items-center gap-2.5 text-red-600 bg-red-50 border border-red-100 rounded-xl p-3.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">ไม่พบข้อมูลหมายเลขรถ <span className="font-semibold">"{unitNo}"</span></span>
            </div>
          )}
        </div>

        {/* Forklift Info Card */}
        {forkliftInfo && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-400 to-yellow-500 px-6 py-3 flex items-center gap-2">
              <Truck className="w-4 h-4 text-slate-900" />
              <span className="font-bold text-slate-900 text-sm">ข้อมูลรถโฟล์คลิฟท์ — {unitNo.toUpperCase()}</span>
            </div>
            <div className="p-6 grid grid-cols-2 gap-3">
              <InfoRow label="ยี่ห้อ" value={forkliftInfo.brand} />
              <InfoRow label="รุ่น" value={forkliftInfo.model} />
              <InfoRow label="พิกัดยก" value={forkliftInfo.capacity} />
              <InfoRow label="เชื้อเพลิง" value={forkliftInfo.fuel} />
              <InfoRow label="สีรถ" value={forkliftInfo.color} isColor />
            </div>
          </div>
        )}

        {/* Image Upload */}
        {forkliftInfo && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-500" />
                อัพโหลดรูปสภาพรถ
              </h3>
              {images.length > 0 && (
                <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2.5 py-1 rounded-full">{images.length} รูป</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-4">ถ่ายรูปสภาพรถทุกมุมก่อนรับมอบ — รูปจะถูกบันทึกในระบบ</p>

            <button onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 hover:bg-indigo-50/50 rounded-xl p-6 flex flex-col items-center gap-2 transition-all duration-200 cursor-pointer group">
              <div className="bg-white border border-slate-200 group-hover:border-indigo-200 rounded-xl p-2.5 shadow-sm group-hover:shadow-md transition-all duration-200">
                <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <span className="text-sm text-slate-600 group-hover:text-indigo-600 font-medium transition-colors">แตะเพื่อเลือกรูป</span>
              <span className="text-xs text-slate-400">รองรับ JPG, PNG, HEIC</span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />

            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-4">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`รูปที่ ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <button onClick={() => removeImage(idx)}
                      className="absolute top-1.5 right-1.5 bg-slate-900/70 hover:bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors duration-200 opacity-0 group-hover:opacity-100">
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-1 left-1 bg-black/50 text-white text-xs rounded px-1">{idx + 1}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        {forkliftInfo && !submitted && (
          <button onClick={handleSubmit}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold py-4 rounded-2xl transition-all duration-200 active:scale-[0.98] text-base shadow-md hover:shadow-lg flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5" />
            ยืนยันรับมอบรถ
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {submitted && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="bg-emerald-100 rounded-xl p-2.5 flex-shrink-0">
              <CheckCircle className="w-7 h-7 text-emerald-600" />
            </div>
            <div>
              <p className="font-bold text-emerald-800">บันทึกการรับมอบเรียบร้อย!</p>
              <p className="text-sm text-emerald-600 mt-0.5">ข้อมูลและรูปภาพถูกบันทึกในระบบแล้ว ผู้จัดการสามารถดูได้ที่แดชบอร์ด</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function InfoRow({ label, value, isColor }: { label: string; value: string; isColor?: boolean }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
      <p className="text-xs text-slate-500 font-medium mb-1.5">{label}</p>
      {isColor ? (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border border-slate-200 shadow-sm flex-shrink-0" style={{ backgroundColor: value }} />
          <span className="text-sm font-bold text-slate-800">{value}</span>
        </div>
      ) : (
        <p className="text-sm font-bold text-slate-800">{value}</p>
      )}
    </div>
  );
}
