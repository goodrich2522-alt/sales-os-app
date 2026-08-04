// lib/quoteImport/imageOcr.ts — OCR รูป (JPEG/PNG) ในเบราว์เซอร์ด้วย Tesseract.js
// ไฟล์ไม่ออกนอกเครื่อง 100% · โหลดไลบรารี + ภาษาไทยแบบ lazy เฉพาะตอนใช้จริง

export const isImageFile = (name: string) => /\.(jpe?g|png|webp|bmp)$/i.test(name);

// อ่านข้อความจากรูป (ไทย+อังกฤษ) → คืนข้อความดิบ ให้ parser เดิมเดาผู้ผลิต/รายการรถต่อ
export async function readImageText(
  file: File,
  onProgress?: (pct: number, status: string) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("tha+eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      onProgress?.(Math.round((m.progress || 0) * 100), m.status || "");
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}
