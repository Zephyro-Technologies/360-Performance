// Real authentication on Supabase Auth. Roles come from the `profiles` table
// (server-side, RLS-enforced via has_role). The client `can()` is UX only —
// every privileged action is also gated by RLS / the admin-users Edge Function.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Role } from "./types";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  can: (capability: "edit" | "delete" | "manage") => boolean;
}

const DB_TO_APP: Record<string, Role> = { admin: "Admin", staff: "Staff", viewer: "Viewer" };

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(session: Session | null): Promise<AuthUser | null> {
  if (!session?.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("name, role, active")
    .eq("id", session.user.id)
    .single();
  if (!data || data.active === false) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: data.name ?? session.user.email ?? "",
    role: DB_TO_APP[data.role] ?? "Viewer",
    active: data.active,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      const u = await loadProfile(data.session);
      if (alive) {
        setUser(u);
        setLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = await loadProfile(session);
      if (alive) setUser(u);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error ? error.message : null };
  }

  function can(capability: "edit" | "delete" | "manage"): boolean {
    if (!user) return false;
    if (user.role === "Admin") return true;
    if (user.role === "Staff") return capability !== "manage";
    return false; // Viewer is read-only
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, logout, resetPassword, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
