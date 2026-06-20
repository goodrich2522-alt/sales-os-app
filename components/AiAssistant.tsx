"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Swords, MessageSquareQuote, LineChart, PackageSearch } from "lucide-react";
import { useApp } from "@/lib/AppContext";

/**
 * พี่เก่ง — ผู้ช่วยเซลล์อัจฉริยะ (Sales Copilot)
 * ──────────────────────────────────────────────────────────────────────────
 * ตอนนี้เป็น "โครง" (scaffold) ไว้ก่อน — UI ครบ แต่ยังไม่มีสมอง
 * เวลาเติมความสามารถจริง ให้แก้แค่ฟังก์ชัน `getAssistantReply()` ด้านล่าง
 * (เช่น เรียก API ของทีม Sales Copilot / GAS / LLM) — ส่วน UI ไม่ต้องแตะ
 */

type ChatMsg = { id: string; role: "user" | "assistant"; text: string };

// ปุ่มลัด 4 เรื่องที่ทีมพี่เก่งดูแล (ตรงกับ All Team Agent/sales-copilot-team)
const QUICK_ACTIONS: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; prompt: string }[] = [
  { key: "competitor", label: "รู้ทันคู่แข่ง",        icon: Swords,            prompt: "ช่วยสรุปจุดเด่น-จุดอ่อนของคู่แข่ง เทียบกับเรา" },
  { key: "closing",    label: "ปิดการขาย / ตอบ Objection", icon: MessageSquareQuote, prompt: "ลูกค้าบอกว่า \"รถจีนจะทนไหม\" ตอบยังไงดี" },
  { key: "diagnose",   label: "วิเคราะห์ปัญหายอด",     icon: LineChart,         prompt: "ช่วยวิเคราะห์ว่าทำไมเดือนนี้ยอดตก" },
  { key: "product",    label: "รู้ลึกสินค้า / จับคู่รุ่น", icon: PackageSearch,    prompt: "ลูกค้าโกดังแคบ เพดานต่ำ ควรเสนอรุ่นไหน" },
];

// ── จุดเสียบสมอง: เติมความสามารถจริงตรงนี้ทีหลัง ──────────────────────────────
// ปัจจุบันตอบ placeholder ไว้ก่อน (แดนจะเติมความรู้/ต่อ API ให้ภายหลัง)
async function getAssistantReply(_userText: string): Promise<string> {
  // TODO(แดน): แทนที่ด้วยการเรียกผู้ช่วยจริง เช่น
  //   const res = await fetch(GAS_URL + "?action=askCopilot&q=" + encodeURIComponent(_userText));
  //   return (await res.json()).answer;
  return "ตอนนี้พี่เก่งยังเป็นโครงอยู่นะครับ 🛠️ — แดนกำลังเติมความสามารถให้ เดี๋ยวพี่เก่งจะช่วยเรื่องคู่แข่ง / ปิดการขาย / วิเคราะห์ยอด / จับคู่รุ่นได้เต็มที่เร็วๆ นี้ครับ";
}

export default function AiAssistant({ salesUserName }: { salesUserName?: string }) {
  const { forklifts, sales } = useApp();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "assistant",
      text: `สวัสดีครับ${salesUserName ? " พี่" + salesUserName : ""} ผมพี่เก่ง ผู้ช่วยขายของทีมเรา 👋\nอยากให้ช่วยเรื่องไหน เลือกจากปุ่มด้านล่าง หรือพิมพ์ถามได้เลยครับ`,
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, open]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const userMsg: ChatMsg = { id: `u_${Date.now()}`, role: "user", text: t };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setBusy(true);
    const reply = await getAssistantReply(t);
    setMessages(prev => [...prev, { id: `a_${Date.now()}`, role: "assistant", text: reply }]);
    setBusy(false);
  };

  const availableCount = forklifts.filter(f => f.status === "พร้อมขาย").length;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 text-white font-bold text-sm pl-3.5 pr-4 py-3 rounded-full shadow-xl shadow-indigo-300/50 transition-all active:scale-95"
          aria-label="เปิดผู้ช่วย AI พี่เก่ง">
          <span className="relative flex">
            <Sparkles className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-white" />
          </span>
          <span className="hidden sm:inline">ถามพี่เก่ง</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 flex flex-col sm:w-[400px] sm:h-[600px] sm:max-h-[85vh] bg-white sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-3.5 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-2">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm leading-tight flex items-center gap-1.5">
                  พี่เก่ง
                  <span className="text-[10px] font-semibold bg-amber-400/90 text-amber-900 px-1.5 py-0.5 rounded-full">เบต้า</span>
                </p>
                <p className="text-indigo-200 text-xs">ผู้ช่วยเซลล์อัจฉริยะ</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white hover:bg-white/20 rounded-xl p-2 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Live context hint */}
          <div className="px-4 py-2 bg-violet-50 border-b border-violet-100 text-[11px] text-violet-600 flex items-center gap-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            เห็นข้อมูลสด: รถพร้อมขาย {availableCount} คัน · ดีลทั้งหมด {sales.length} รายการ
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-slate-50">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line leading-relaxed shadow-sm ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-md"
                    : "bg-white text-slate-700 border border-slate-100 rounded-bl-md"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="px-3 pt-2.5 pb-1 flex gap-2 overflow-x-auto flex-shrink-0 border-t border-slate-100 bg-white">
            {QUICK_ACTIONS.map(({ key, label, icon: Icon, prompt }) => (
              <button key={key} onClick={() => send(prompt)} disabled={busy}
                className="flex items-center gap-1.5 flex-shrink-0 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 border border-violet-100 px-3 py-2 rounded-xl transition-all">
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 flex items-center gap-2 flex-shrink-0 bg-white">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(input); } }}
              placeholder="พิมพ์ถามพี่เก่ง..."
              className="flex-1 border border-slate-200 hover:border-slate-300 rounded-2xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all" />
            <button onClick={() => send(input)} disabled={!input.trim() || busy}
              className="bg-gradient-to-r from-violet-600 to-indigo-700 hover:from-violet-500 hover:to-indigo-600 disabled:opacity-40 text-white rounded-2xl p-2.5 transition-all active:scale-95 flex-shrink-0">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
