import type { NextConfig } from "next";

// basePath สำหรับ GitHub Pages (repo sales-os-app.github.io → เสิร์ฟที่ /sales-os-app.github.io)
// ตั้งผ่าน env ได้ (เช่น ปล่อยว่างตอนเทสต์ local) ค่าเริ่มต้น = /sales-os-app.github.io
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/sales-os-app.github.io";

const nextConfig: NextConfig = {
  output: "export",            // สร้างเว็บ static (โฟลเดอร์ out/) สำหรับ GitHub Pages
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: true,         // ให้ทุกหน้าออกเป็น .../index.html (เปิดบน Pages ได้ตรง)
  images: { unoptimized: true },// GitHub Pages ไม่มี image optimizer ของ Next
};

export default nextConfig;
