import type { Role } from "./types";

const KEY = "curbstand.session";

export type Session = {
  id: string | null;
  name: string;
  photoUrl?: string;
  producerType?: "at_home" | "local_farmer" | "large_scale_farmer";
  email: string;
  role: Role;
  localOnly: boolean;
  token?: string;
};

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.email || (parsed.role !== "customer" && parsed.role !== "producer")) return null;
    if (import.meta.env.PUBLIC_DATA_SOURCE !== "fixtures" && !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
  if (session.localOnly && session.id) {
    const accounts = readDemoAccounts().filter((account) => account.email !== session.email);
    sessionStorage.setItem("curbstand.demo-accounts", JSON.stringify([...accounts, session]));
  }
}

export function readDemoAccounts(): Session[] {
  try {
    const accounts = JSON.parse(sessionStorage.getItem("curbstand.demo-accounts") ?? "[]");
    return Array.isArray(accounts) ? accounts.filter((account) => account?.id && account?.email && ["customer", "producer"].includes(account.role)) : [];
  } catch { return []; }
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
