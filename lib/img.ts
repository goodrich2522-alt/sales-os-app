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
