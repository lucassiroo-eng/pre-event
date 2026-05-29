import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const ADMIN_EMAILS = [
  "jonathan.bakikatula@factorial.co",
  "lucas.siroo@factorial.co",
];

const EMAIL_DOMAIN = "@factorial.co";

type AuthCtx = {
  email: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => { ok: true } | { ok: false; error: string };
  signup: (email: string, password: string) => { ok: true } | { ok: false; error: string };
  logout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

const SESSION_KEY = "factorial.session.email";
const USERS_KEY = "factorial.users.v1"; // { [email]: passwordHash }

// Tiny non-cryptographic hash. This is a *mock* auth (data only in
// localStorage, no server). Don't use this for anything that needs real
// security — see chat.
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function readUsers(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeUsers(users: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}

function validateEmail(e: string): string | null {
  const v = normalizeEmail(e);
  if (!v) return "Email requerido";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Email no válido";
  if (!v.endsWith(EMAIL_DOMAIN)) return `Solo emails ${EMAIL_DOMAIN}`;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SESSION_KEY);
    // Only accept stored sessions that still match the domain rule.
    if (stored && stored.endsWith(EMAIL_DOMAIN)) {
      // Seed admin accounts on first run so they can sign in with any password
      // they later choose (no — they still need to sign up; we just preserve
      // whatever's in the users map).
      setEmail(stored);
    }
    setHydrated(true);
  }, []);

  const login: AuthCtx["login"] = (rawEmail, password) => {
    const err = validateEmail(rawEmail);
    if (err) return { ok: false, error: err };
    if (!password) return { ok: false, error: "Contraseña requerida" };
    const e = normalizeEmail(rawEmail);
    const users = readUsers();
    if (!users[e]) return { ok: false, error: "Cuenta no encontrada. Regístrate primero." };
    if (users[e] !== hash(password)) return { ok: false, error: "Contraseña incorrecta" };
    window.localStorage.setItem(SESSION_KEY, e);
    setEmail(e);
    return { ok: true };
  };

  const signup: AuthCtx["signup"] = (rawEmail, password) => {
    const err = validateEmail(rawEmail);
    if (err) return { ok: false, error: err };
    if (!password || password.length < 6) {
      return { ok: false, error: "Contraseña mínimo 6 caracteres" };
    }
    const e = normalizeEmail(rawEmail);
    const users = readUsers();
    if (users[e]) return { ok: false, error: "Ya existe una cuenta con este email. Inicia sesión." };
    users[e] = hash(password);
    writeUsers(users);
    window.localStorage.setItem(SESSION_KEY, e);
    setEmail(e);
    return { ok: true };
  };

  const logout = () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
    setEmail(null);
  };

  const isAuthenticated = !!email;
  const isAdmin = !!email && ADMIN_EMAILS.includes(email);

  return (
    <Ctx.Provider value={{ email, isAuthenticated, isAdmin, hydrated, login, signup, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

export { ADMIN_EMAILS, EMAIL_DOMAIN };
