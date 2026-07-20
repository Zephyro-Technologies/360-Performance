// Module 1 — branded login on real Supabase Auth (email + password).
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Lock, Mail } from "lucide-react";
import { useAuth } from "../data/auth";
import { setRememberMe } from "../data/supabase";
import { Button } from "@360/ui/button";
import { Checkbox } from "@360/ui/checkbox";
import { Input } from "@360/ui/input";
import { Label } from "@360/ui/label";

// Remembered emails — a local suggestion list for the email field, independent
// of the browser password manager (which doesn't reliably prompt on SPA logins).
const REMEMBERED_EMAILS_KEY = "360.rememberedEmails";
const MAX_REMEMBERED = 5;

function loadRememberedEmails(): string[] {
  try {
    const raw = localStorage.getItem(REMEMBERED_EMAILS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function rememberEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  try {
    const next = [normalized, ...loadRememberedEmails().filter((e) => e !== normalized)].slice(
      0,
      MAX_REMEMBERED,
    );
    localStorage.setItem(REMEMBERED_EMAILS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures (private mode, quota) — this is a convenience only
  }
}

export function Login() {
  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [rememberedEmails] = useState(loadRememberedEmails);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Choose session persistence BEFORE signing in, so Supabase writes the new
    // session to the right store (localStorage if remembered, else sessionStorage).
    setRememberMe(remember);
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      toast.error(error === "Invalid login credentials" ? "Incorrect email or password." : error);
      return;
    }
    rememberEmail(email);
    navigate("/");
  }

  async function handleForgot() {
    if (!email) {
      toast.error("Enter your email above first, then click Forgot password.");
      return;
    }
    const { error } = await resetPassword(email);
    toast[error ? "error" : "success"](error ?? "Password reset link sent to your email.");
  }

  return (
    <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-black p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="360 Performance" draggable={false} className="h-8 w-auto" />
        </div>
        <div>
          <div className="mb-4 h-1 w-16 bg-[#cc0000]" />
          <h2 className="max-w-md text-4xl leading-tight">
            Drive every part of the business from one cockpit.
          </h2>
          <p className="mt-4 max-w-sm text-sm text-white/60">
            Orders, invoicing, inventory and analytics, synced in real time across
            the 360 Performance back office.
          </p>
        </div>
        <p className="text-xs uppercase tracking-widest text-white/40 [font-family:var(--font-heading)]">
          Admin Dashboard · Islamabad
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <img src="/logo-dark.svg" alt="360 Performance" draggable={false} className="h-7 w-auto" />
          </div>
          <h1 className="text-3xl">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your credentials to access the dashboard.
          </p>

          <div className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-zinc-300 bg-white pl-9 text-zinc-900 placeholder:text-zinc-500"
                  placeholder="you@360performance.pk"
                  autoComplete="username email"
                  list={rememberedEmails.length ? "remembered-emails" : undefined}
                  required
                />
                {rememberedEmails.length > 0 && (
                  <datalist id="remembered-emails">
                    {rememberedEmails.map((e) => (
                      <option key={e} value={e} />
                    ))}
                  </datalist>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-zinc-300 bg-white pl-9 text-zinc-900 placeholder:text-zinc-500"
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-xs text-[#cc0000] hover:underline"
                  onClick={handleForgot}
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="h-10 w-full bg-[#cc0000] text-white hover:bg-[#a30000]"
            >
              {busy ? "Signing in…" : "Sign In"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
