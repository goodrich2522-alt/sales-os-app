export type PaymentType = "เงินสด" | "ไฟแนนซ์";
export type CustomerType = "บุคคลทั่วไป" | "นิติบุคคล" | "ราชการ";

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
}

export interface InspectionRecord {
  id: string;
  unit_no: string;
  transporter_name: string;
  date: string;
  images: string[];
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
}
