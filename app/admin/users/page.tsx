"use client";

// หน้าแอดมิน — จัดการสิทธิ์ผู้ใช้ (/admin/users)
// เข้าได้เฉพาะอีเมลใน adminEmails · อนุมัติ/ระงับ/เปลี่ยนบทบาท/ลบผู้ใช้ + จัดการรายชื่อแอดมิน
// ⚠️ คุมระดับ UI เท่านั้น — การคุมจริงต้องเปิด RLS (DEV-PLAN เฟส 1)

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  ShieldCheck, ArrowLeft, RefreshCw, Trash2, UserCheck, UserX, Clock,
  Plus, AlertCircle, Loader2, Crown, X,
} from "lucide-react";
import GoogleLoginButton, { type GoogleUser } from "@/components/GoogleLoginButton";
import {
  getAccessConfig, adminUpdateUsers, isAdminEmail, userStatus, ROLE_LABELS,
  type KnownUser, type KnownUserStatus,
} from "@/lib/auth";
const STATUS_META: Record<KnownUserStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: UserCheck },
  pending:  { label: "รออนุมัติ",   cls: "bg-amber-100 text-amber-700 border-amber-200",       icon: Clock },
  blocked:  { label: "ถูกระงับ",    cls: "bg-red-100 text-red-700 border-red-200",              icon: UserX },
};

export default function AdminUsersPage() {
  const [admin, setAdmin] = useState<GoogleUser | null>(null); // แอดมินที่ล็อกอินอยู่ (ไม่ persist — ปิดแท็บ = ออก)
  const [denied, setDenied] = useState("");
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<Record<string, KnownUser>>({});
  const [adminEmails, setAdminEmails] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  // เพิ่มผู้ใช้ล่วงหน้า (pre-authorize ก่อนเขาล็อกอิน) — เลือกบทบาท + อนุมัติทันที
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState("sales");
  const [addUserError, setAddUserError] = useState("");

  const reload = useCallback(async () => {
    const cfg = await getAccessConfig();
    setUsers(cfg.knownUsers);
    setAdminEmails(cfg.adminEmails);
  }, []);

  const handleGoogle = async (u: GoogleUser) => {
    setChecking(true); setDenied("");
    const cfg = await getAccessConfig();
    setChecking(false);
    if (!isAdminEmail(u.email, cfg.adminEmails)) {
      setDenied(`บัญชี ${u.email} ไม่มีสิทธิ์แอดมิน — เฉพาะแอดมินเท่านั้นที่จัดการสิทธิ์ผู้ใช้ได้`);
      return;
    }
    setAdmin(u);
    setUsers(cfg.knownUsers);
    setAdminEmails(cfg.adminEmails);
  };

  // ทุก action = อ่าน config ล่าสุดก่อนแก้แล้วเซฟ (read-modify-write) กันทับข้อมูลกัน
  const mutate = async (fn: Parameters<typeof adminUpdateUsers>[0]) => {
    setBusy(true);
    try { await adminUpdateUsers(fn); await reload(); }
    catch (e) { console.warn("adminUpdate", e); }
    setBusy(false);
  };

  const setStatus = (email: string, status: KnownUserStatus) =>
    mutate((u, a) => { if (u[email]) u[email] = { ...u[email], status }; return { users: u, adminEmails: a }; });
  const setRole = (email: string, role: string) =>
    mutate((u, a) => { if (u[email]) u[email] = { ...u[email], role }; return { users: u, adminEmails: a }; });
  const removeUser = (email: string) =>
    mutate((u, a) => { delete u[email]; return { users: u, adminEmails: a }; });
  // เพิ่มผู้ใช้เอง + กำหนดบทบาท → อนุมัติทันที (ล็อกอิน Google ด้วยอีเมลนี้เข้าใช้งานได้เลย)
  const addUser = () => {
    const email = newUserEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) { setAddUserError("กรุณากรอกอีเมลให้ถูกต้อง"); return; }
    if (users[email]) { setAddUserError("อีเมลนี้มีอยู่แล้วในรายชื่อ"); return; }
    const name = newUserName.trim() || email.split("@")[0];
    const role = newUserRole;
    setNewUserEmail(""); setNewUserName(""); setNewUserRole("sales"); setAddUserError(""); setShowAddUser(false);
    mutate((u, a) => { u[email] = { name, role, status: "approved" }; return { users: u, adminEmails: a }; });
  };
  const addAdmin = () => {
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    setNewAdminEmail("");
    mutate((u, a) => ({ users: u, adminEmails: [...new Set([...a, email])] }));
  };
  const removeAdmin = (email: string) => {
    if (adminEmails.length <= 1) return; // ต้องเหลือแอดมินอย่างน้อย 1 คน
    mutate((u, a) => ({ users: u, adminEmails: a.filter(e => e !== email) }));
  };

  // ── ยังไม่ล็อกอิน ──
  if (!admin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-violet-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-600" />
            <div className="p-8">
              <div className="flex flex-col items-center mb-8">
                <div className="bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-2xl p-4 mb-4 shadow-lg shadow-violet-200">
                  <ShieldCheck className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-slate-800">จัดการสิทธิ์ผู้ใช้</h1>
                <p className="text-slate-500 text-sm mt-1 text-center">เฉพาะแอดมิน — เข้าสู่ระบบด้วย Google</p>
              </div>
              {denied && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-px" />{denied}
                </div>
              )}
              <div className="flex flex-col items-center gap-3">
                {checking
                  ? <div className="flex items-center gap-2 text-slate-500 text-sm py-2"><Loader2 className="w-4 h-4 animate-spin" /> กำลังตรวจสอบสิทธิ์...</div>
                  : <GoogleLoginButton onSuccess={handleGoogle} onError={setDenied} />}
              </div>
              <Link href="/" className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mt-5 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />กลับหน้าหลัก
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const entries = Object.entries(users).sort(([, a], [, b]) => {
    // รออนุมัติขึ้นก่อน → อนุมัติแล้ว → ถูกระงับ
    const order: Record<string, number> = { pending: 0, approved: 1, blocked: 2 };
    return (order[userStatus(a) ?? "approved"] ?? 1) - (order[userStatus(b) ?? "approved"] ?? 1);
  });
  const pendingCount = entries.filter(([, u]) => userStatus(u) === "pending").length;

  // ── หน้าจัดการ ──
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl p-2 transition-all"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="flex items-center gap-2.5">
              <div className="bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl p-2"><ShieldCheck className="w-5 h-5 text-white" /></div>
              <div>
                <h1 className="text-base font-bold text-slate-800 leading-tight">จัดการสิทธิ์ผู้ใช้</h1>
                <p className="text-slate-500 text-xs">แอดมิน: {admin.name}</p>
              </div>
            </div>
          </div>
          <button onClick={reload} disabled={busy}
            className="flex items-center gap-1.5 text-slate-600 hover:text-violet-700 hover:bg-violet-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-all border border-transparent hover:border-violet-200 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /><span className="hidden sm:inline">รีเฟรช</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 flex flex-col gap-5">
        {pendingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-amber-800 font-semibold">
            <Clock className="w-4 h-4 flex-shrink-0" />มี {pendingCount} บัญชีรอการอนุมัติ
          </div>
        )}

        {/* ── รายชื่อผู้ใช้ ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-800">ผู้ใช้ทั้งหมด</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">{entries.length} บัญชี</span>
              <button onClick={() => { setShowAddUser(v => !v); setAddUserError(""); }} disabled={busy}
                className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" />เพิ่มผู้ใช้
              </button>
            </div>
          </div>

          {/* ── ฟอร์มเพิ่มผู้ใช้ล่วงหน้า ── */}
          {showAddUser && (
            <div className="px-5 py-4 border-b border-slate-100 bg-violet-50/50 flex flex-col gap-2.5">
              <div className="flex flex-col sm:flex-row gap-2">
                <input value={newUserEmail} autoFocus type="email"
                  onChange={e => { setNewUserEmail(e.target.value); setAddUserError(""); }}
                  onKeyDown={e => { if (e.key === "Enter") addUser(); }}
                  placeholder="อีเมลผู้ใช้ (Gmail)"
                  className="flex-1 border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400" />
                <input value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addUser(); }}
                  placeholder="ชื่อ (ไม่บังคับ)"
                  className="sm:w-40 border border-violet-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400" />
                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)}
                  className="sm:w-32 border border-violet-200 rounded-lg px-2.5 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400">
                  <option value="sales">{ROLE_LABELS.sales}</option>
                  <option value="stock">{ROLE_LABELS.stock}</option>
                  <option value="transporter">{ROLE_LABELS.transporter}</option>
                </select>
              </div>
              {addUserError && (
                <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{addUserError}</p>
              )}
              <div className="flex items-center gap-2">
                <button onClick={addUser} disabled={busy || !newUserEmail.trim()}
                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50">
                  <UserCheck className="w-3.5 h-3.5" />เพิ่มและอนุมัติเลย
                </button>
                <button onClick={() => { setShowAddUser(false); setAddUserError(""); setNewUserEmail(""); setNewUserName(""); }}
                  className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs font-semibold px-3 py-2 rounded-lg transition-all">ยกเลิก</button>
                <span className="ml-auto text-[11px] text-slate-400">อนุมัติทันที — ล็อกอิน Google ด้วยอีเมลนี้เข้าได้เลย</span>
              </div>
            </div>
          )}

          {entries.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">ยังไม่มีผู้ใช้ลงทะเบียน</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {entries.map(([email, u]) => {
                const status = userStatus(u) ?? "approved";
                const meta = STATUS_META[status];
                const StatusIcon = meta.icon;
                return (
                  <div key={email} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">{u.name || "—"}</p>
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>
                          <StatusIcon className="w-3 h-3" />{meta.label}
                        </span>
                        {isAdminEmail(email, adminEmails) && (
                          <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                            <Crown className="w-3 h-3" />แอดมิน
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 truncate">{email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {/* บทบาท */}
                      <select value={u.role} disabled={busy}
                        onChange={e => setRole(email, e.target.value)}
                        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50">
                        <option value="sales">{ROLE_LABELS.sales}</option>
                        <option value="stock">{ROLE_LABELS.stock}</option>
                        <option value="transporter">{ROLE_LABELS.transporter}</option>
                      </select>
                      {/* อนุมัติ / ระงับ */}
                      {status !== "approved" && (
                        <button onClick={() => setStatus(email, "approved")} disabled={busy}
                          className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                          <UserCheck className="w-3.5 h-3.5" />อนุมัติ
                        </button>
                      )}
                      {status !== "blocked" && (
                        <button onClick={() => setStatus(email, "blocked")} disabled={busy}
                          className="flex items-center gap-1 text-red-600 hover:bg-red-50 border border-red-200 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                          <UserX className="w-3.5 h-3.5" />ระงับ
                        </button>
                      )}
                      {/* ลบ */}
                      {deleteConfirm === email ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { removeUser(email); setDeleteConfirm(null); }} disabled={busy}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50">ลบเลย</button>
                          <button onClick={() => setDeleteConfirm(null)} className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1.5 rounded-lg">ยกเลิก</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirm(email)} disabled={busy}
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all disabled:opacity-50" title="ลบผู้ใช้">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── รายชื่อแอดมิน ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-violet-100 overflow-hidden">
          <div className="px-5 py-4 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
            <Crown className="w-4 h-4 text-violet-600" />
            <h2 className="text-sm font-bold text-violet-800">แอดมิน ({adminEmails.length})</h2>
            <span className="ml-auto text-xs text-violet-500">เข้าหน้านี้และอนุมัติผู้ใช้ได้</span>
          </div>
          <div className="p-4 flex flex-col gap-2">
            {adminEmails.map(email => (
              <div key={email} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3.5 py-2.5">
                <span className="flex-1 text-sm text-slate-700 truncate">{email}</span>
                {adminEmails.length > 1 ? (
                  <button onClick={() => removeAdmin(email)} disabled={busy}
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-all disabled:opacity-50" title="ถอดสิทธิ์แอดมิน">
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400">แอดมินคนสุดท้าย — ถอดไม่ได้</span>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <input value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addAdmin(); }}
                placeholder="เพิ่มอีเมลแอดมิน..."
                className="flex-1 border border-dashed border-violet-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:text-slate-400 bg-white text-slate-800" />
              <button onClick={addAdmin} disabled={busy || !newAdminEmail.trim()}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />เพิ่ม
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          ผู้ใช้ใหม่ที่ล็อกอินครั้งแรกจะเป็นสถานะ &quot;รออนุมัติ&quot; — เข้าใช้งานได้เมื่อแอดมินกดอนุมัติที่หน้านี้ ·
          การคุมสิทธิ์ระดับฐานข้อมูลจริง (RLS) อยู่ในแผน DEV-PLAN เฟส 1
        </p>
      </main>
    </div>
  );
}
