// lib/auth.ts — จำผู้ใช้ Google (อีเมล → ชื่อ/บทบาท) เก็บใน fieldConfig.knownUsers บน Google Sheet
import * as api from "./api";

type KnownUser = { name: string; role: string };
type CfgWithUsers = { knownUsers?: Record<string, KnownUser> } & Record<string, unknown>;

const norm = (email: string) => email.trim().toLowerCase();

/** ค้นว่าอีเมลนี้เคยลงทะเบียนชื่อไว้หรือยัง (คืน null ถ้ายังไม่เคย / ไม่มี GAS) */
export async function lookupKnownUser(email: string): Promise<KnownUser | null> {
  if (!api.apiEnabled) return null;
  try {
    const cfg = (await api.getFieldConfigApi()) as CfgWithUsers;
    const u = cfg?.knownUsers?.[norm(email)];
    return u && u.name ? u : null;
  } catch {
    return null;
  }
}

/** บันทึกชื่อ/บทบาทของอีเมลนี้ลง fieldConfig.knownUsers (merge ไม่ทับของเดิม) */
export async function rememberKnownUser(email: string, name: string, role: string): Promise<void> {
  if (!api.apiEnabled) return;
  try {
    const cfg = ((await api.getFieldConfigApi()) as CfgWithUsers) || {};
    const users: Record<string, KnownUser> = cfg.knownUsers || {};
    users[norm(email)] = { name, role };
    cfg.knownUsers = users;
    await api.saveFieldConfigApi(cfg);
  } catch {
    /* ไม่ critical — ถ้าเซฟไม่ได้ ยังล็อกอินต่อได้ (เก็บ session ในเครื่อง) */
  }
}
