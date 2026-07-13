export type PaymentType = "เงินสด" | "ไฟแนนซ์";
export type CustomerType = "บุคคลทั่วไป" | "นิติบุคคล" | "ราชการ";
export type SaleStatus = "ขายแล้ว" | "จอง" | "รอผ่านไฟแนนซ์";
export type VehicleType = "Forklift" | "Stacker" | "Handlift";
export type ContactSource = "Line" | "Facebook" | "TikTok" | "โทร" | "Google" | "คนอื่นบอกต่อ";
export type SaleType = "รถเช่า" | "รถขายเต็มคัน" | "รถมือสอง" | "งานซ่อม";

// Kept as string aliases for flexibility — dropdown options are user-configurable
export type FuelType = string;
export type ForkliftStatus = string;

export interface Forklift {
  id: string;
  unit_no: string;
  brand: string;
  model: string;
  capacity: string;
  capacity_kg?: string;
  height: string;
  fuel: string;
  cost_price: number;
  stock_price: number;
  status: string;
  created_at: string;
  vehicle_category?: "Forklift" | "Stacker" | "Handlift";
  // Extended fields
  pi_no?: string;
  vehicle_group?: string;
  year?: string;
  control_type?: string;
  fork_length?: string;
  attachments?: string;
  install_date?: string;
  install_cost?: number;
  po_status?: string;
  location?: string;
  received_date?: string;
  custom_fields?: Record<string, string>;
}

export interface VehicleSpec {
  fuel?: string;
  weight?: string;
  height?: string;
  length?: string;
  width?: string;
}

export interface Sale {
  id: string;
  forklift_id: string;
  forklift_unit_no: string;
  forklift_brand: string;
  forklift_model: string;
  sales_staff: string;
  customer_name: string;
  customer_tel: string;
  customer_type: CustomerType;
  province: string;
  payment_type: PaymentType;
  finance_company?: string;
  actual_sale: number;
  deposit: number;
  delivery_date: string;
  remark?: string;
  custom_fields?: Record<string, string>;
  created_at: string;
  // New fields
  sale_status?: SaleStatus;
  vehicle_type?: VehicleType;
  vehicle_spec?: VehicleSpec;
  warranty_expiry?: string;
  parts_schedule?: string;
  custom_notifications?: { label: string; date: string }[];
  contact_source?: ContactSource;
  sale_type?: SaleType;
}

// ── รูปตรวจรถ 6 ช่องบังคับ (ผู้รับรถ/ผู้ส่งมอบรถ ต้องถ่ายครบทุกช่อง) ──
export const INSPECTION_SLOTS = [
  { key: "name_plate", label: "Name Plate",  icon: "🏷️" },
  { key: "pi_doc",     label: "เอกสาร PI",   icon: "📄" },
  { key: "front",      label: "รถด้านหน้า",  icon: "🚛" },
  { key: "back",       label: "รถด้านหลัง",  icon: "🔙" },
  { key: "left",       label: "รถด้านซ้าย",  icon: "◀️" },
  { key: "right",      label: "รถด้านขวา",   icon: "▶️" },
] as const;
export type InspectionSlotKey = (typeof INSPECTION_SLOTS)[number]["key"];
export const SLOT_LABELS: Record<string, string> =
  Object.fromEntries(INSPECTION_SLOTS.map(s => [s.key, s.label]));

export interface InspectionRecord {
  id: string;
  unit_no: string;
  transporter_name: string;
  transporter_phone?: string; // เบอร์ผู้ขนส่ง (ล็อกอินด้วยชื่อเล่น+เบอร์)
  date: string;
  images: string[]; // รูปทั้งหมดรวมกัน (6 ช่อง + รูปเพิ่มเติม) — หน้าเก่าอ่านช่องนี้
  image_slots?: Partial<Record<InspectionSlotKey, string>>; // รูปแยกช่อง → โชว์ป้ายกำกับ
  role?: "ผู้รับรถ" | "ผู้ส่งมอบรถ";
}

export interface DeletedInspectionRecord extends InspectionRecord {
  deletedAt: string;
}

export interface StockUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: "stock";
}

export interface SalesUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: "sales";
  target_monthly: number;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  type: "text" | "select";
  options?: string[];
}
