"use client";
// components/UpdateChecker.tsx — เตือนเมื่อมีเวอร์ชันใหม่ขึ้นเว็บ (กันเบราว์เซอร์แคชโค้ดเก่า)
// เช็คจากชื่อ chunk "webpack-<hash>.js" ที่เปลี่ยนทุกครั้งที่ build ใหม่
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export function UpdateChecker() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const curSrc = document.querySelector('script[src*="/_next/static/chunks/webpack-"]')?.getAttribute("src") || "";
    const curHash = curSrc.match(/webpack-[^"'/]+?\.js/)?.[0];
    if (!curHash) return; // เดฟ/หา chunk ไม่เจอ → ไม่เช็ค

    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(window.location.href, { cache: "no-store" });
        const html = await res.text();
        const remote = html.match(/webpack-[^"'/]+?\.js/)?.[0];
        if (remote && remote !== curHash && !stopped) setStale(true);
      } catch { /* ออฟไลน์/พลาด — ข้าม */ }
    };

    const iv = setInterval(check, 120000);              // เช็คทุก 2 นาที
    const onFocus = () => { if (!stale) check(); };     // เช็คตอนกลับมาที่แท็บ
    window.addEventListener("focus", onFocus);
    check();
    return () => { stopped = true; clearInterval(iv); window.removeEventListener("focus", onFocus); };
  }, [stale]);

  if (!stale) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-3">
      <RefreshCw className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      <span className="text-sm font-medium">มีเวอร์ชันใหม่ของแอป</span>
      <button onClick={() => window.location.reload()}
        className="text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-white px-3 py-1.5 rounded-xl transition-all flex-shrink-0">
        โหลดเวอร์ชันใหม่
      </button>
    </div>
  );
}
