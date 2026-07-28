"use client";
// components/QuoteImport.tsx — นำเข้ารถจากใบเสนอราคา (เฟส 4)
// อ่าน PDF ในเบราว์เซอร์ (ไฟล์ไม่ออกนอกเครื่อง) → parse → คนตรวจ/แก้ → บันทึกเข้าสต็อก
// รอบแรกรองรับ HELI (text layer) · เจ้าอื่นทยอยเพิ่ม

import { useState, useMemo } from "react";
import { useApp } from "@/lib/AppContext";
import { readPdfText, looksScanned, parseQuoteText, detectVendor, parseQuoteExcel, readExcelRows, isExcelFile, normalizeStaxxModel, ParsedVehicle } from "@/lib/quoteImport";
import { categorizeModel } from "@/lib/constants";
import { today } from "@/lib/format";
import { Forklift } from "@/lib/types";
import { X, Upload, FileText, CheckCircle, AlertTriangle, Loader2, Trash2, Undo2 } from "lucide-react";

export function QuoteImport({ onClose }: { onClose: () => void }) {
  const { addForkliftsBulk, forklifts, deleteForklift } = useApp();
  const [rows, setRows] = useState<ParsedVehicle[]>([]);
  const [busy, setBusy] = useState(false);
  const [vendor, setVendor] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(0);
  const [skipped, setSkipped] = useState(0);         // จำนวนที่ข้ามเพราะ SN ซ้ำ
  const [importedIds, setImportedIds] = useState<string[]>([]); // สำหรับปุ่มยกเลิกการนำเข้า
  const [done, setDone] = useState(false);           // บันทึกเสร็จแล้ว → แสดงหน้าสรุป

  const existingIds = new Set(forklifts.map((f) => String(f.id)));

  // ราคาทุนจากสต็อก แยกตามรุ่น (เอาค่าล่าสุด) — ใช้เติมให้รถนำเข้ารุ่นเดียวกันที่ยังไม่มีราคา
  const costByModel = useMemo(() => {
    const m = new Map<string, number>();
    [...forklifts]
      .filter((f) => Number(f.cost_price) > 0 && f.model)
      .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .forEach((f) => m.set(String(f.model).trim().toUpperCase(), Number(f.cost_price))); // ล่าสุดทับ
    return m;
  }, [forklifts]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true); setNotice("");
    const all: ParsedVehicle[] = [];
    const vendors = new Set<string>();
    for (const f of Array.from(files)) {
      try {
        // Excel = Serial No. List ของ STAXX (มี SN จริงเป็นช่วง)
        if (isExcelFile(f.name)) {
          const res = parseQuoteExcel(await readExcelRows(f));
          if (res.vehicles.length === 0) { setNotice(`⚠️ "${f.name}" ไม่พบคอลัมน์ Serial No./Model`); continue; }
          vendors.add("STAXX (Serial List)");
          all.push(...res.vehicles);
          continue;
        }
        // PDF
        const text = await readPdfText(f);
        if (looksScanned(text)) {
          const v = detectVendor(text);
          vendors.add(v === "unknown" ? "สแกน" : v);
          setNotice(`⚠️ "${f.name}" เป็นไฟล์สแกน (ไม่มี text layer) — ต้องใช้ OCR (ยังไม่รองรับ) หรือกรอกมือ`);
          continue;
        }
        const res = parseQuoteText(text);
        vendors.add(res.vendor);
        if (res.vendor === "unknown") { setNotice(`⚠️ "${f.name}" เดาผู้ผลิตไม่ได้`); continue; }
        if (res.vendor !== "HELI" && res.vendor !== "ROCKMAN") { setNotice(`ℹ️ "${f.name}" เป็น ${res.vendor} — ใบ PDF รองรับ HELI/ROCKMAN (STAXX ใช้ไฟล์ Excel Serial List)`); continue; }
        if (res.vehicles.length === 0) { setNotice(`⚠️ "${f.name}" (${res.vendor}) อ่านไม่พบรายการรถ — ตรวจไฟล์`); continue; }
        all.push(...res.vehicles);
      } catch (e) {
        setNotice(`อ่าน "${f.name}" ไม่ได้: ${e instanceof Error ? e.message : "ผิดพลาด"}`);
      }
    }
    // ── merge ราคา FOB จาก Proforma STAXX → รถ Excel SN (จับคู่ตามรุ่น) ──
    const staxxSN = all.filter((v) => v.vendor === "STAXX" && v.SN);           // Excel: มี SN ไม่มีราคา
    const staxxPF = all.filter((v) => v.vendor === "STAXX" && !v.SN && v.fobUsd); // Proforma: มีราคาไม่มี SN
    const others = all.filter((v) => v.vendor !== "STAXX");
    let staxxRows: ParsedVehicle[];
    if (staxxSN.length && staxxPF.length) {
      const fobMap = new Map(staxxPF.map((v) => [normalizeStaxxModel(v.model), v.fobUsd!]));
      staxxRows = staxxSN.map((v) => {
        const fob = fobMap.get(normalizeStaxxModel(v.model));
        return fob ? { ...v, fobUsd: fob, flags: [...(v.flags ?? []), `ราคา FOB $${fob} — เติมราคาทุนบาทเอง`] } : v;
      });
      const hit = staxxRows.filter((v) => v.fobUsd).length;
      setNotice(`✅ จับคู่ราคา FOB จาก Proforma ให้ ${hit}/${staxxRows.length} คัน (ราคา FOB เป็น USD ไม่ใช่ราคาทุนบาท)`);
    } else {
      staxxRows = staxxSN.length ? staxxSN : staxxPF;
    }
    // เติมราคาทุนจากฐานข้อมูล (รถรุ่นเดียวกันในสต็อก) ให้คันที่ parser ยังไม่ได้ราคา
    const finalRows = [...others, ...staxxRows].map((v) => {
      if (v.cost_price) return v;
      const dbCost = costByModel.get(String(v.model).trim().toUpperCase());
      return dbCost
        ? { ...v, cost_price: dbCost, flags: [...(v.flags ?? []), "ราคาทุนดึงจากสต็อก (รุ่นเดียวกัน) — ตรวจ/แก้ได้"] }
        : v;
    });
    setVendor([...vendors].join(", "));
    setRows(finalRows);
    setBusy(false);
  };

  const edit = (i: number, key: keyof ParsedVehicle, val: string) =>
    setRows((r) => r.map((v, j) => (j === i ? { ...v, [key]: val } : v)));
  const removeRow = (i: number) => setRows((r) => r.filter((_, j) => j !== i));

  const toForklift = (v: ParsedVehicle, i: number): Forklift => ({
    id: v.SN || `${v.pi_no || "PI"}#${i + 1}`,
    SN: v.SN || "",
    brand: v.brand, model: v.model,
    capacity: v.capacity || "", capacity_kg: v.capacity_kg || "",
    height: v.height || "", fuel: v.fuel || "",
    cost_price: v.cost_price || 0, stock_price: 0,
    status: "รอรับ", created_at: today(),
    vehicle_category: categorizeModel(v.model),
    pi_no: v.pi_no,
    custom_fields: {
      ...(v.mast ? { MAST: v.mast } : {}),
      ...(v.valve ? { Valve: v.valve } : {}),
      ...(v.fobUsd ? { "ราคา FOB (USD)": String(v.fobUsd) } : {}),
      ชีตต้นทาง: "ใบเสนอราคา",
    },
  } as Forklift);

  const save = () => {
    // กัน SN ซ้ำ: ถ้ามีในสต็อกแล้ว หรือซ้ำภายในชุดเดียวกัน → ข้าม (ไม่นำเข้าครั้งที่ 2)
    const seen = new Set(existingIds);
    const fresh: Forklift[] = [];
    let skip = 0;
    rows.forEach((v, i) => {
      const fk = toForklift(v, i);
      if (seen.has(fk.id)) { skip++; return; }
      seen.add(fk.id);
      fresh.push(fk);
    });
    if (fresh.length) addForkliftsBulk(fresh);
    setImportedIds(fresh.map((f) => String(f.id)));
    setSkipped(skip);
    setSaved(fresh.length);
    setDone(true);
  };

  // ยกเลิกการนำเข้า — ลบรถที่เพิ่งนำเข้าออกทั้งล็อต
  const undoImport = () => {
    importedIds.forEach((id) => deleteForklift(id));
    setImportedIds([]);
    onClose();
  };

  const dupCount = rows.filter((v, i) => existingIds.has(toForklift(v, i).id)).length;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl">
        {/* header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-600" />นำเข้าจากใบเสนอราคา</h3>
            <p className="text-xs text-slate-500 mt-0.5">อ่านไฟล์ในเครื่อง 100% · รองรับ HELI (PDF) · STAXX (Excel Serial List){vendor ? ` · อ่านได้: ${vendor}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><X className="w-5 h-5" /></button>
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 min-h-0 p-5 flex flex-col gap-4">
          {done ? (
            <div className="text-center py-10 text-emerald-700">
              <CheckCircle className="w-12 h-12 mx-auto mb-3" />
              <p className="font-bold">บันทึกเข้าสต็อกแล้ว {saved} คัน (สถานะ "รอรับ")</p>
              {skipped > 0 && <p className="text-sm text-amber-600 mt-1">ข้าม {skipped} คัน — SN ซ้ำกับที่มีในสต็อกแล้ว</p>}
              <div className="flex items-center justify-center gap-2 mt-5">
                {importedIds.length > 0 && (
                  <button onClick={undoImport} className="px-4 py-2 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 flex items-center gap-1.5">
                    <Undo2 className="w-4 h-4" />ยกเลิกการนำเข้า
                  </button>
                )}
                <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700">เสร็จสิ้น</button>
              </div>
            </div>
          ) : (
            <>
              {/* dropzone */}
              <label className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-all">
                <input type="file" accept="application/pdf,.xlsx,.xls" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
                {busy ? <Loader2 className="w-8 h-8 mx-auto text-emerald-600 animate-spin" />
                  : <Upload className="w-8 h-8 mx-auto text-slate-400" />}
                <p className="text-sm font-semibold text-slate-600 mt-2">{busy ? "กำลังอ่าน..." : "ลากไฟล์มาวาง หรือกดเลือก"}</p>
                <p className="text-xs text-slate-400 mt-0.5">PDF ใบเสนอราคา (HELI) · Excel Serial List (STAXX) · หลายไฟล์พร้อมกันได้</p>
              </label>

              {notice && <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{notice}</div>}

              {rows.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">อ่านได้ {rows.length} คัน — ตรวจ/แก้ก่อนบันทึก</p>
                    {dupCount > 0 && <span className="text-xs text-red-600 font-semibold">⚠️ {dupCount} คัน SN ซ้ำกับที่มีในสต็อก</span>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-slate-400 text-left">
                          {["รุ่น", "SN", "พิกัด", "พลังงาน", "MAST", "Valve", "ราคาทุน", "ชนิด", ""].map((h) => <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((v, i) => {
                          const dup = existingIds.has(toForklift(v, i).id);
                          return (
                            <tr key={i} className={`border-t border-slate-100 ${dup ? "bg-red-50/60" : ""}`}>
                              <Cell val={v.model} onChange={(x) => edit(i, "model", x)} w="w-32" />
                              <Cell val={v.SN ?? ""} onChange={(x) => edit(i, "SN", x)} w="w-28" />
                              <Cell val={v.capacity ?? ""} onChange={(x) => edit(i, "capacity", x)} w="w-16" />
                              <Cell val={v.fuel ?? ""} onChange={(x) => edit(i, "fuel", x)} w="w-16" />
                              <Cell val={v.mast ?? ""} onChange={(x) => edit(i, "mast", x)} w="w-16" />
                              <Cell val={v.valve ?? ""} onChange={(x) => edit(i, "valve", x)} w="w-12" />
                              <Cell val={v.cost_price ? String(v.cost_price) : ""} onChange={(x) => edit(i, "cost_price", x)} w="w-20" />
                              <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{categorizeModel(v.model)}</td>
                              <td className="px-1"><button onClick={() => removeRow(i)} className="text-slate-300 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {rows.some((v) => v.flags?.length) && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      ⚠️ บางคันมีข้อมูลที่ parser ไม่มั่นใจ: {[...new Set(rows.flatMap((v) => v.flags ?? []))].join(" · ")}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* footer */}
        {!done && rows.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 flex-shrink-0 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">ยกเลิก</button>
            <button onClick={save} className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" />บันทึกเข้าสต็อก {rows.length} คัน
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({ val, onChange, w }: { val: string; onChange: (v: string) => void; w: string }) {
  return (
    <td className="px-1 py-1">
      <input value={val} onChange={(e) => onChange(e.target.value)}
        className={`${w} border border-transparent hover:border-slate-200 focus:border-emerald-400 rounded px-1.5 py-1 text-xs bg-transparent focus:bg-white focus:outline-none`} />
    </td>
  );
}
