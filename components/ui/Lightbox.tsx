// components/ui/Lightbox.tsx — ดูรูปเต็มจอ (เดิมซ้ำ 4 หน้า) · เฟส 1
"use client";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { driveImg } from "@/lib/img";

/** ดูรูปเต็มจอ พร้อมเลื่อนซ้าย-ขวาเมื่อมีหลายรูป
 *  imgs = รายการ URL/ไฟล์รูป · idx = รูปที่กำลังดู · onClose ปิด · onIdx เปลี่ยนรูป */
export function Lightbox({
  imgs, idx, onClose, onIdx,
}: {
  imgs: string[];
  idx: number;
  onClose: () => void;
  onIdx: (next: number) => void;
}) {
  if (!imgs.length) return null;
  const go = (delta: number) => onIdx((idx + delta + imgs.length) % imgs.length);
  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all"
        aria-label="ปิด"
      >
        <X className="w-6 h-6" />
      </button>
      {imgs.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); go(-1); }}
            className="absolute left-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all"
            aria-label="รูปก่อนหน้า"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); go(1); }}
            className="absolute right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-all"
            aria-label="รูปถัดไป"
          >
            <ChevronRight className="w-7 h-7" />
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/40 rounded-full px-3 py-1">
            {idx + 1} / {imgs.length}
          </span>
        </>
      )}
      <img
        src={driveImg(imgs[idx])}
        alt=""
        className="max-h-[85vh] max-w-full object-contain rounded-xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}
