export interface LocalUser {
  id: string;
  name: string;
  email: string;
  role: "SUPERADMIN" | "ADMIN" | "AGENT";
}

const STORAGE_KEY = "crm.local.session";

export const localMode = !import.meta.env.VITE_API_TARGET;

const ACCOUNTS: Array<{ email: string; password: string; user: LocalUser }> = [
  {
    email: "admin@crm.local",
    password: "admin123",
    user: { id: "local-superadmin", name: "Jerry", email: "admin@crm.local", role: "SUPERADMIN" },
  },
  {
    email: "canyoujerry@gmail.com",
    password: "Sushil$21",
    user: { id: "local-superadmin-jerry", name: "Jerry", email: "canyoujerry@gmail.com", role: "SUPERADMIN" },
  },
];

export function getStoredUser(): LocalUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalUser) : null;
  } catch {
    return null;
  }
}

export function storeUser(user: LocalUser): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

export function clearStoredUser(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function verifyLocal(email: string, password: string): LocalUser | null {
  const found = ACCOUNTS.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password
  );
  return found ? found.user : null;
}

export const demoHint = `${ACCOUNTS[0].email} / ${ACCOUNTS[0].password}`;
