// scripts/build-golden.mjs — เฟส 2: สร้าง golden dataset จาก Excel สต็อกจริง
// อ่านอย่างเดียว ไม่แก้ไฟล์ Excel · ไม่แตะ Supabase
// กติกาทั้งหมดอ้างอิง sync-rules.md (เฟส 1) — เจอเคสนอกสเปกให้ติดธงไว้ ไม่เดาเอง
// รัน: node scripts/build-golden.mjs
import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const XLSX = join(ROOT, "STOCK 2569 อัพเดต 24-7-69 .xlsx");
const OUT_DIR = join(ROOT, "local-data"); // gitignored — มีชื่อลูกค้า/ราคาทุน

// ── ชื่อเซลล์ที่รู้จัก (ใช้ known-list เพื่อไม่เผลอตัด "(ประเทศไทย)" / "(มหาชน)" ทิ้ง) ──
// เรียงยาว→สั้น เพื่อไม่ให้ "แก้ว" ไปกินคำว่า "ไหมแก้ว"
const STAFF_CONFIDENT = ["ไหมแก้ว", "เฟิร์นขอนแก่น", "เฟิร์น ขอนแก่น", "เฟิร์น", "ดรีม", "ผึ้ง", "กี้", "ออย"];
const STAFF_DELIMITED_ONLY = ["แก้ว"]; // สั้น/กำกวม — จับเฉพาะเมื่อมีตัวคั่นชัดเจน
const STATUS_WORDS = ["จอง", "รอเข้าไปรับ", "รอรับ", "สั่งผลิต", "ขายแล้ว"];

// ── สถานะ: Excel → แอป (sync-rules.md ข้อ 1) ──
const STATUS_EXACT = {
  "ขายแล้ว": "ปิดการขายแล้ว",
  "ขายแล้ว/ไฟแนนซ์": "ปิดการขายแล้ว",
  "ขายแล้บ": "ปิดการขายแล้ว",
  "ว่าง": "พร้อมขาย",
  "ติดจอง": "จอง",
  "ติดจอง/รอส่ง": "จอง",
  "จองแล้ว": "จอง",
  "รอเข้าไปรับ": "รอรับ",
  "รถเช่า": "รถเช่า",
  "สั่งผลิต": "สั่งผลิต",
  "สั่งผลิต/ไฟแนนซ์": "สั่งผลิต",
  "ดรีม": "สั่งผลิต",      // ชื่อเซลล์หลงช่อง — ช่องวันรับเขียน "สั่งผลิต"
  "ไหมแก้ว": "สั่งผลิต",   // ^ เหมือนกัน
  "เคลมน้ำดื่มขอนแก่น": "เคลม/รับกลับ",
};

const cell = c => {
  const v = c?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map(t => t.text).join("").trim();
    if (v.result !== undefined) return String(v.result).trim();
    if (v instanceof Date) return v;
    if (v.text) return String(v.text).trim();
    return "";
  }
  return String(v).trim();
};

/** แปลงปี พ.ศ. → ค.ศ. · รองรับ 69 / 2569 / 1969 (Excel เดาปี 2 หลักเป็น ค.ศ.1969) */
function beToCe(y) {
  if (y <= 99) return y + 2500 - 543;            // 69 → 2569 → 2026
  if (y >= 2400) return y - 543;                 // 2569 → 2026
  if (y >= 1900 && y < 2000) return (y % 100) + 2500 - 543; // 1969 = Excel อ่าน "69" ผิด → 2026
  return y;
}

/** แปลงวันที่ Excel (พ.ศ.) → ISO ค.ศ. · คืน {iso, note} */
function parseDate(raw) {
  if (raw instanceof Date) {
    const y = beToCe(raw.getUTCFullYear());
    const iso = `${y}-${String(raw.getUTCMonth() + 1).padStart(2, "0")}-${String(raw.getUTCDate()).padStart(2, "0")}`;
    const note = y !== raw.getUTCFullYear() ? `แปลงปีจากช่องวันที่ Excel: ${raw.getUTCFullYear()} → ${y}` : "";
    return { iso, note };
  }
  const s = String(raw ?? "").trim();
  if (!s || s === "-") return { iso: "", note: "" };

  // ค่าเสียที่เคาะไว้แล้วในเฟส 1
  if (s === "29/1/9/2569") return { iso: "2026-01-29", note: "แก้วันที่เสีย 29/1/9/2569 → 29/1/2569" };
  if (s === "141/2569")    return { iso: "2026-01-14", note: "แก้วันที่เสีย 141/2569 → 14/1/2569" };

  // ข้อความสถานะที่หลงมาอยู่ช่องวันที่ → ไม่ใช่วันรับรถ
  if (/สั่งผลิต|รับกลับ|รอรับ/.test(s)) return { iso: "", note: "" };

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return { iso: "", note: `⚠️ วันที่อ่านไม่ออก: "${s}"` };
  const [, d, mo, y] = m.map(Number);
  const ce = beToCe(y);
  if (d > 31 || mo > 12) return { iso: "", note: `⚠️ วันที่ผิดช่วง: "${s}"` };
  return { iso: `${ce}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, note: "" };
}

/** ดึงวันสั่งผลิตจากข้อความ เช่น "สั่งผลิต 21/01/69" */
function orderDateFrom(...texts) {
  for (const t of texts) {
    const m = String(t ?? "").match(/สั่งผลิต\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (m) { const { iso } = parseDate(m[1]); if (iso) return iso; }
  }
  return "";
}

/** ดึงเลขสัญญาเช่า GR-xxx */
function rentalNoFrom(...texts) {
  for (const t of texts) {
    const m = String(t ?? "").match(/GR[-\s]?(\d{2,4})/);
    if (m) return `GR-${m[1]}`;
  }
  return "";
}

/** แยกชื่อเซลล์ออกจากช่องรายละเอียดลูกค้า → {customer, staff, note}
 *  รองรับหลายแบบที่เจอจริง: "บ.X (ดรีม)" · "บ.X /ดรีม" · "บ.X ผึ้ง" · "ลูกค้าดรีม" · "ไหมแก้ว จอง บ.X" */
function splitStaff(detail) {
  let s = String(detail ?? "").trim();
  if (!s) return { customer: "", staff: "", note: "" };
  let staff = "";
  const notes = [];

  // 1) มีตัวคั่นชัดเจน — (ชื่อ) หรือ /ชื่อ · ปลอดภัยกับทุกชื่อรวม "แก้ว"
  for (const name of [...STAFF_CONFIDENT, ...STAFF_DELIMITED_ONLY]) {
    const paren = new RegExp(`\\(\\s*${name}\\s*\\)`);
    const slash = new RegExp(`[/／]\\s*${name}(?=\\s|$)`);
    if (paren.test(s)) { staff = name; s = s.replace(paren, " "); break; }
    if (slash.test(s)) { staff = name; s = s.replace(slash, " "); break; }
  }
  // 2) ชื่อโผล่หัว/กลาง/ท้ายโดยไม่มีตัวคั่น — เฉพาะชื่อที่ไม่กำกวม
  if (!staff) {
    for (const name of STAFF_CONFIDENT) {
      if (new RegExp(`(^|\\s|ลูกค้า)${name}(\\s|$|จอง)`).test(s)) {
        staff = name;
        s = s.replace(new RegExp(`(ลูกค้า)?${name}`), " ");
        break;
      }
    }
  }
  // เก็บกวาดตัวคั่น/ช่องว่างที่เหลือ
  s = s.replace(/[/／]+/g, " ").replace(/\s{2,}/g, " ").replace(/^[\s\-–·]+|[\s\-–·]+$/g, "").trim();
  // เศษที่เป็นคำสถานะล้วน (เช่น "รอเข้าไปรับ", "จอง") ไม่ใช่ชื่อลูกค้า → ย้ายไปหมายเหตุ
  if (STATUS_WORDS.includes(s)) { notes.push(s); s = ""; }
  // แถวรถเช่ามักขึ้นต้นด้วย "รถเช่า GR-xxx" หรือ "GR-xxx" เฉยๆ — เลขสัญญาเก็บแยกอยู่แล้ว
  s = s.replace(/^(รถเช่า\s*)?GR[-\s]?\d+\s*/, "").replace(/^รถเช่า\s*/, "").trim();

  return { customer: s, staff, note: notes.join(" · ") };
}

/** ตัดโน้ตท้ายเลข PI เช่น "PI002 รถ 3 คอนโทรล / NO SS" → {pi, note}
 *  ค่าที่ไม่ใช่เลขเอกสาร (เช่น "ไม่เจอในสต๊อค") ให้ไปอยู่ในโน้ต ไม่ใช่ช่อง PI */
function splitPi(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { pi: "", note: "" };
  const m = s.match(/^(PI[-\s]?\w+)\s*(.*)$/i);
  if (m) return { pi: m[1].replace(/\s+/g, ""), note: m[2].trim() };
  if (/^HCTH[-\w]*/i.test(s)) return { pi: s.replace(/\s+/g, ""), note: "" }; // SALE CONTRACT ของ HANGCHA
  return { pi: "", note: s };
}

// ── นิยามแต่ละชีต ──
// หมายเหตุ: ชีต HANDLIFT/WAREHOUSE/เจนบรรเจิด ไม่มีคอลัมน์ "ยี่ห้อ" โดยตรง
//   - TYPE / หมวดหมู่ = ประเภทสินค้า (Hand Pallet Truck, Stacker ฯลฯ) → เก็บลง custom_fields ไม่ใช่ brand
//   - รถมาจาก = ผู้จัดหา (STAXX = ยี่ห้อจริง · CNC/CNC MOVING = ซัพพลายเออร์) → เป็น brand เฉพาะที่เป็นยี่ห้อจริง
const KNOWN_BRANDS = ["STAXX", "HELI", "HANGCHA"];
const brandFromSupplier = s => KNOWN_BRANDS.find(b => String(s ?? "").toUpperCase().includes(b)) ?? "";

const SHEETS = {
  "HELI 2569":    { category: "Forklift", group: "HELI",       brand: () => "HELI" },
  "HANGCHA 2569": { category: "Forklift", group: "HANGCHA",    brand: () => "HANGCHA" },
  "HANDLIFT":     { category: "Handlift", group: "HANDLIFT",   brand: () => "STAXX" },
  "WAREHOUSE":    { category: "Stacker",  group: "STACKER",    brand: r => brandFromSupplier(r.from) },
  "เจนบรรเจิด":    { category: "Handlift", group: "เจนบรรเจิด", brand: () => "เจนบรรเจิด" },
};

// ── 8 SN ที่แอปมีแต่ Excel ไม่มี (sync-rules ข้อ 6) — จับคู่ด้วย รุ่น+ทุน ──
const DB_ONLY_SNS = [
  { sn: "05025DU1396", model: "CPD25-A7LIH4-S", cost: 342760 },
  { sn: "08012JUH193", model: "CDD12J-K",       cost: 53000 },
  { sn: "05035DU1885", model: "CPD35-GC6LI-S",  cost: 467400 },
  { sn: "05035DU1886", model: "CPD35-GC6LI-S",  cost: 467400 },
  { sn: "05030DU1981", model: "CPD30-GC6LI-S",  cost: 449650 },
  { sn: "010253T0935", model: "CPCD25-Q22K2",   cost: 271500 },
  { sn: "M1BES15051",  model: "CBD20-WS",       cost: 25000 },
  { sn: "M1BFS02002",  model: "CBD15-WS",       cost: 18000 },
];

const main = async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);

  const units = [];
  const skipped = { blank: 0, byySheet: {} };
  const issues = [];

  for (const ws of wb.worksheets) {
    const sheetName = ws.name.trim();
    const cfg = SHEETS[sheetName];
    if (!cfg) { issues.push(`⚠️ ชีต "${sheetName}" ไม่มีในสเปก — ข้ามทั้งชีต`); continue; }

    // อ่านหัวคอลัมน์ (ชื่อซ้ำได้ เช่น "รายละเอียด" 2 ช่อง → เก็บเป็น list)
    const hdr = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { hdr[i] = cell(c); });
    const idxOf = pred => { for (let i = 1; i < hdr.length; i++) if (pred(hdr[i] ?? "")) return i; return -1; };
    const idxAll = pred => { const r = []; for (let i = 1; i < hdr.length; i++) if (pred(hdr[i] ?? "")) r.push(i); return r; };

    const C = {
      pi:      idxOf(h => h === "PI" || h === "SALE CONTRACT"),
      type:    idxOf(h => h === "TYPE" || h === "หมวดหมู่"),
      model:   idxOf(h => h === "MODEL" || h.includes("โมเดล")),
      mast:    idxOf(h => h === "MAST"),
      valve:   idxOf(h => h === "Valve"),
      sn:      idxOf(h => h === "SN"),
      cost:    idxOf(h => h.includes("PRICE") || h === "ต้นทุน"),
      date:    idxOf(h => h.includes("วันรับ")),
      status:  idxOf(h => h.includes("สถานะ")),
      invoice: idxOf(h => h.includes("ใบกำกับ")),
      height:  idxOf(h => h === "ความสูง"),
      weight:  idxOf(h => h === "น้ำหนัก"),
      from:    idxOf(h => h === "รถมาจาก"),
      location:idxOf(h => h === "พิกัด"),
      details: idxAll(h => h.includes("รายละเอียด")),
    };

    let sheetSkipped = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = i => (i > 0 ? cell(row.getCell(i)) : "");
      const src = `${sheetName}:r${r}`;

      const sn      = String(get(C.sn) || "").replace(/^-$/, "");
      const model   = String(get(C.model) || "");
      const costRaw = get(C.cost);
      const statusR = String(get(C.status) || "");
      const dateRaw = C.date > 0 ? cell(row.getCell(C.date)) : "";
      const detailsText = C.details.map(i => get(i)).filter(Boolean);

      // แถวเปล่า / แถวรอกรอก (มีแต่ชื่อหมวดหมู่) → ข้าม
      const hasContent = [sn, model, costRaw, statusR, ...detailsText].some(v => v !== "" && v !== "-");
      if (!hasContent) { sheetSkipped++; continue; }

      // ── สถานะ ──
      let status = "", statusNote = "";
      const st = statusR.trim();
      if (STATUS_EXACT[st]) {
        status = STATUS_EXACT[st];
      } else if (/^รถเช่า/.test(st)) {
        status = "รถเช่า";
      } else if (/^สั่งผลิต/.test(st)) {
        status = "สั่งผลิต";
      } else if (st === "") {
        // ช่องสถานะว่าง — เดาจากบริบทตามสเปก
        if (/สั่งผลิต/.test(String(dateRaw))) { status = "สั่งผลิต"; }
        else if (detailsText.some(d => d === "รอเข้าไปรับ")) { status = "รอรับ"; statusNote = "สถานะว่าง — อ่านจากช่องรายละเอียด"; }
        else if (/รอรับกลับ|รับกลับแล้ว/.test(String(dateRaw))) { status = "เคลม/รับกลับ"; statusNote = "สถานะว่าง — ช่องวันรับเขียนว่ารับกลับ"; }
        else if (sn) { status = "พร้อมขาย"; }
        else { status = "สั่งผลิต"; statusNote = "สถานะว่าง + ไม่มี SN → ถือเป็นรถสั่งผลิต"; }
      } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(st)) {
        status = "ปิดการขายแล้ว";
        statusNote = `ช่องสถานะเป็นวันที่ "${st}" — ตีเป็นขายแล้วตามสเปก`;
      } else {
        status = "";
        issues.push(`❌ ${src} — สถานะนอกสเปก: "${st}" (ต้องเคาะเพิ่ม)`);
      }
      // วันรับเขียนว่ารับกลับ → ทับเป็นเคลม/รับกลับ (เช่น r216 สถานะ "ขายแล้ว" แต่รอรับกลับ)
      if (/รอรับกลับ|รับกลับแล้ว/.test(String(dateRaw)) && status !== "เคลม/รับกลับ") {
        statusNote = `เดิม "${status}" → เปลี่ยนเป็นเคลม/รับกลับ (ช่องวันรับ: "${dateRaw}")`;
        status = "เคลม/รับกลับ";
      }

      // ── วันที่ ──
      const { iso: received, note: dateNote } = parseDate(dateRaw);
      if (dateNote.startsWith("⚠️")) issues.push(`${dateNote} — ${src}`);

      // ── ลูกค้า / เซลล์ ──
      const custRaw = detailsText[0] ?? "";
      const { customer, staff, note: custNote } = splitStaff(custRaw);
      const { pi, note: piNote } = splitPi(get(C.pi));

      const cost = Number(String(costRaw).replace(/[^\d.]/g, "")) || 0;

      const cf = {};
      const put = (k, v) => { if (v) cf[k] = String(v); };
      put("MAST", get(C.mast));
      put("Valve", get(C.valve));
      put("ประเภทสินค้า", get(C.type));   // TYPE / หมวดหมู่ — ไม่ใช่ยี่ห้อ
      put("ผู้จัดหา", get(C.from));        // รถมาจาก (STAXX / CNC MOVING ฯลฯ)
      put("เลขที่ใบกำกับภาษี", get(C.invoice));
      put("รายละเอียด (ลูกค้า)", customer);
      put("เซลล์ผู้ดูแล", staff);
      put("โน้ต PI", piNote);
      put("วันสั่งผลิต", orderDateFrom(dateRaw, statusR, get(C.invoice)));
      put("เลขสัญญาเช่า", status === "รถเช่า" ? rentalNoFrom(statusR, ...detailsText) : "");
      put("หมายเหตุ", [custNote, ...detailsText.slice(1)].filter(Boolean).join(" · "));
      put("ชีตต้นทาง", sheetName);
      if (/ไฟแนนซ์/.test(st)) put("การชำระเงิน", "ไฟแนนซ์");

      const rec = {
        key: sn || `SYNTH:${src}`,
        sn,
        source: src,
        sheet: sheetName,
        brand: cfg.brand({ type: get(C.type), from: get(C.from) }),
        model,
        vehicle_category: cfg.category,
        vehicle_group: cfg.group,
        cost_price: cost,
        status,
        received_date: received,
        pi_no: pi,
        height: get(C.height),
        capacity_kg: get(C.weight),
        location: get(C.location),
        custom_fields: cf,
        _notes: [statusNote, dateNote].filter(Boolean),
      };
      units.push(rec);
    }
    skipped.byySheet[sheetName] = sheetSkipped;
    skipped.blank += sheetSkipped;
  }

  // ═══ จัดการ SN ซ้ำตามกติกาเฟส 1 ═══
  const bySn = new Map();
  units.filter(u => u.sn).forEach(u => { (bySn.get(u.sn) ?? bySn.set(u.sn, []).get(u.sn)).push(u); });
  const dupLog = [];
  const dropped = new Set();

  for (const [sn, list] of bySn) {
    if (list.length < 2) continue;
    const sheets = [...new Set(list.map(u => u.sheet))];
    const hasSale = u => !!(u.custom_fields["เลขที่ใบกำกับภาษี"] || u.custom_fields["รายละเอียด (ลูกค้า)"]);

    // แบบ A — ซ้ำข้ามชีต HANDLIFT ↔ WAREHOUSE : ยึดแถวที่มีหลักฐานการขาย
    if (sheets.length > 1 && sheets.every(s => s === "HANDLIFT" || s === "WAREHOUSE")) {
      const winners = list.filter(hasSale);
      const keep = winners.length === 1 ? winners[0] : list[0];
      const merged = list.find(u => u !== keep);
      // ดึงสเปกละเอียดจาก WAREHOUSE มาเติมให้แถวที่เก็บ
      if (merged) {
        keep.height ||= merged.height; keep.capacity_kg ||= merged.capacity_kg;
        keep.location ||= merged.location; keep.brand ||= merged.brand;
        dropped.add(merged);
      }
      keep._notes.push(`รวมแถวซ้ำข้ามชีต (${list.map(u => u.source).join(" + ")}) — ยึดแถวที่มีหลักฐานการขาย`);
      dupLog.push({ sn, แบบ: "A ข้ามชีต", เก็บ: keep.source, ตัด: merged?.source ?? "-", สถานะ: keep.status });
      continue;
    }

    // แบบ B — แถวซ้ำสนิท (ลูกค้า+ใบกำกับ+ทุน เหมือนกัน) : เก็บแถวเดียว
    const sig = u => [u.model, u.cost_price, u.custom_fields["เลขที่ใบกำกับภาษี"] ?? "", u.custom_fields["รายละเอียด (ลูกค้า)"] ?? ""].join("|");
    if (list.length === 2 && sig(list[0]) === sig(list[1])) {
      dropped.add(list[1]);
      list[0]._notes.push(`แถวซ้ำสนิทกับ ${list[1].source} — เก็บแถวเดียว`);
      dupLog.push({ sn, แบบ: "B ซ้ำสนิท", เก็บ: list[0].source, ตัด: list[1].source, สถานะ: list[0].status });
      continue;
    }

    // แบบ D (08015JUG698) — แถวสต็อกจริง + แถวที่เซลล์เพิ่มทีหลัง : รวมเป็นคันเดียว
    const ghost = list.find(u => /ไม่เจอในสต๊อค/.test(u.pi_no + (u.custom_fields["โน้ต PI"] ?? "")));
    if (ghost && list.length === 2) {
      const keep = list.find(u => u !== ghost);
      keep.status = ghost.status;
      Object.entries(ghost.custom_fields).forEach(([k, v]) => { if (!keep.custom_fields[k] && k !== "ชีตต้นทาง") keep.custom_fields[k] = v; });
      dropped.add(ghost);
      keep._notes.push(`รวมกับ ${ghost.source} (แถวที่เซลล์เพิ่มทีหลัง "ไม่เจอในสต๊อค") — ข้อมูลรถจากสต็อก + การขายจากแถวนั้น`);
      dupLog.push({ sn, แบบ: "D รวมแถวขาย", เก็บ: keep.source, ตัด: ghost.source, สถานะ: keep.status });
      continue;
    }

    // แบบ C — SN เดียวขายคนละลูกค้า : เก็บทั้ง 2 คัน คง SN ซ้ำไว้ (ผู้ใช้เคาะแล้ว)
    list.forEach((u, i) => u._notes.push(`SN ซ้ำโดยตั้งใจ (คันที่ ${i + 1}/${list.length}) — ผู้ใช้เลือกคงไว้ รอยืนยัน SN จริง`));
    dupLog.push({ sn, แบบ: "C ขายคนละราย", เก็บ: list.map(u => u.source).join(" + "), ตัด: "-", สถานะ: list.map(u => u.status).join(" / ") });
  }

  // ═══ รวม 8 SN จากแอปเข้ากับแถวรถสั่งผลิต (sync-rules ข้อ 6) ═══
  const mergeLog = [];
  const orderRows = units.filter(u => !u.sn && !dropped.has(u) && u.status === "สั่งผลิต");
  for (const cand of DB_ONLY_SNS) {
    const hit = orderRows.find(u => !u.sn && u.model === cand.model && u.cost_price === cand.cost);
    if (hit) {
      hit.sn = cand.sn;
      hit.key = cand.sn;
      hit._notes.push(`เติม SN "${cand.sn}" จากแอป (รถผลิตเสร็จมาถึงแล้ว แต่ Excel ยังไม่ได้เติม)`);
      mergeLog.push({ sn: cand.sn, รวมกับ: hit.source, รุ่น: cand.model, ทุน: cand.cost, ลูกค้า: hit.custom_fields["รายละเอียด (ลูกค้า)"] ?? "-" });
    } else {
      mergeLog.push({ sn: cand.sn, รวมกับ: "❌ หาคู่ไม่เจอ", รุ่น: cand.model, ทุน: cand.cost, ลูกค้า: "-" });
      issues.push(`⚠️ SN "${cand.sn}" (${cand.model}, ทุน ${cand.cost.toLocaleString()}) หาแถวคู่ใน Excel ไม่เจอ — ต้องให้ทีมยืนยันในเฟส 3`);
    }
  }

  // ═══ ผลลัพธ์ ═══
  const golden = units.filter(u => !dropped.has(u));
  golden.forEach(u => { if (u._notes.length === 0) delete u._notes; });

  const count = (arr, fn) => arr.reduce((m, u) => { const k = fn(u); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const byStatus = count(golden, u => u.status || "(ว่าง)");
  const bySheet = count(golden, u => u.sheet);
  const noSn = golden.filter(u => !u.sn);
  const totalCost = golden.reduce((s, u) => s + u.cost_price, 0);
  const orderCost = golden.filter(u => u.status === "สั่งผลิต").reduce((s, u) => s + u.cost_price, 0);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "golden-stock.json"), JSON.stringify({
    built_at: new Date().toISOString().slice(0, 10),
    source_file: "STOCK 2569 อัพเดต 24-7-69 .xlsx",
    rules: "sync-rules.md (เฟส 1)",
    total: golden.length,
    units: golden,
  }, null, 2), "utf8");

  const tbl = (obj, h1, h2) => [`| ${h1} | ${h2} |`, "|---|---|", ...Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`)].join("\n");

  const report = `# golden-report.md — รายงานการสร้าง golden dataset (เฟส 2)

> สร้างเมื่อ ${new Date().toISOString().slice(0, 10)} · จาก \`STOCK 2569 อัพเดต 24-7-69 .xlsx\` · กติกาตาม [sync-rules.md](../sync-rules.md)
> ผลลัพธ์: \`local-data/golden-stock.json\` — **${golden.length} คัน** (ยังไม่แตะ Supabase)

## สรุปจำนวน

- อ่านได้ทั้งหมด **${golden.length} คัน** · ข้ามแถวเปล่า/รอกรอก **${skipped.blank} แถว**
- มูลค่าทุนรวม **${totalCost.toLocaleString()} บาท** (ในนี้เป็นรถสั่งผลิตที่ยังไม่เข้า **${orderCost.toLocaleString()} บาท**)
- รถที่ยังไม่มี SN (รอเติมเมื่อผลิตเสร็จ) **${noSn.length} คัน**

### แยกตามชีต
${tbl(bySheet, "ชีต", "จำนวน")}

### แยกตามสถานะ (หลังแปลงเป็นค่าของแอป)
${tbl(byStatus, "สถานะ", "จำนวน")}

### แถวที่ข้าม (เปล่า/รอกรอก)
${tbl(skipped.byySheet, "ชีต", "แถวที่ข้าม")}

## การรวม SN ซ้ำ (${dupLog.length} เคส)

| SN | แบบ | เก็บแถว | ตัดแถว | สถานะผลลัพธ์ |
|---|---|---|---|---|
${dupLog.map(d => `| ${d.sn} | ${d.แบบ} | ${d.เก็บ} | ${d.ตัด} | ${d.สถานะ} |`).join("\n")}

## การเติม SN จากแอปเข้าแถวรถสั่งผลิต (${mergeLog.filter(m => !m.รวมกับ.startsWith("❌")).length}/${mergeLog.length} สำเร็จ)

| SN | รวมกับแถว | รุ่น | ทุน | ลูกค้า |
|---|---|---|---|---|
${mergeLog.map(m => `| ${m.sn} | ${m.รวมกับ} | ${m.รุ่น} | ${m.ทุน.toLocaleString()} | ${m.ลูกค้า} |`).join("\n")}

## รถสั่งผลิตที่ยังไม่มี SN (${noSn.length} คัน — รอเติม SN เมื่อผลิตเสร็จ)

| แถวต้นทาง | PI | รุ่น | ทุน | ลูกค้า | เซลล์ | วันสั่งผลิต |
|---|---|---|---|---|---|---|
${noSn.map(u => `| ${u.source} | ${u.pi_no || "-"} | ${u.model} | ${u.cost_price.toLocaleString()} | ${u.custom_fields["รายละเอียด (ลูกค้า)"] || "-"} | ${u.custom_fields["เซลล์ผู้ดูแล"] || "-"} | ${u.custom_fields["วันสั่งผลิต"] || "-"} |`).join("\n")}

## ⚠️ รายการที่ต้องตรวจ (${issues.length})

${issues.length ? issues.map(i => `- ${i}`).join("\n") : "- ไม่มี — แปลงได้ครบตามสเปก"}
`;

  writeFileSync(join(OUT_DIR, "golden-report.md"), report, "utf8");

  console.log(`✅ golden-stock.json — ${golden.length} คัน · ข้าม ${skipped.blank} แถวเปล่า`);
  console.log(`   สถานะ: ${JSON.stringify(byStatus, null, 0)}`);
  console.log(`   SN ซ้ำจัดการแล้ว ${dupLog.length} เคส · เติม SN จากแอป ${mergeLog.filter(m => !m.รวมกับ.startsWith("❌")).length}/${mergeLog.length}`);
  console.log(`   ⚠️ ต้องตรวจ ${issues.length} รายการ — ดู local-data/golden-report.md`);
};

main().catch(e => { console.error(e); process.exit(1); });
