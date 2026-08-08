// แปลงลิงก์รูป Google Drive ให้แสดงใน <img> ได้
// Google เลิกรองรับ uc?export=view ใน <img> (รูปแตก) → ใช้ thumbnail แทน
export function driveImg(url: string): string {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url; // base64/preview — ใช้ตรงๆ
  if (url.includes("drive.google.com") || url.includes("googleusercontent.com")) {
    const m = url.match(/[-\w]{25,}/); // file id ของ Drive
    if (m) return `https://drive.google.com/thumbnail?id=${m[0]}&sz=w1200`;
  }
  return url;
}

// ย่อรูป → dataURL (jpeg) สำหรับอัปโหลด (ใช้ร่วมหลายหน้า) — max ด้านยาว 800px
export const resizeImageFile = (file: File, max = 800, quality = 0.72): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!ev.target?.result) { reject(new Error("read fail")); return; }
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(max / img.width, max / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("image load fail"));
      img.src = ev.target.result as string;
    };
    reader.onerror = () => reject(new Error("read fail"));
    reader.readAsDataURL(file);
  });
