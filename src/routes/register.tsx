import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TriangleAlert, Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

async function registerRequest(fullName: string, email: string, password: string) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName, email, password }),
  });
  return res.json();
}

type RegisterResponse = {
  ok?: boolean;
  requiresConfirmation?: boolean;
  pendingApproval?: boolean;
  error?: string;
  setupRequired?: boolean;
  missing?: string[];
};

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create Account — Madd Hatter POS Sync" },
      {
        name: "description",
        content: "Create your Madd Hatter POS Sync administrator account.",
      },
      { property: "og:title", content: "Create Account — Madd Hatter POS Sync" },
      {
        property: "og:description",
        content: "Create your Madd Hatter POS Sync administrator account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [setupRequired, setSetupRequired] = useState<string[] | null>(null);
  const [success, setSuccess] = useState<"confirmation" | null>(null);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Full name is required.";
    if (!email.trim()) errs.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Enter a valid email.";
    if (!password) errs.password = "Password is required.";
    else if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (confirm !== password) errs.confirm = "Passwords do not match.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSetupRequired(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const res = (await registerRequest(
        fullName.trim(),
        email.trim(),
        password,
      )) as RegisterResponse;
      if (res.setupRequired) {
        setSetupRequired(res.missing ?? []);
      } else if (!res.ok) {
        setError(res.error ?? "Registration failed");
      } else if (res.pendingApproval) {
        const confirm = res.requiresConfirmation ? "1" : "0";
        window.location.href = `/pending-approval?confirm=${confirm}`;
        return;
      } else if (res.requiresConfirmation) {
        setSuccess("confirmation");
      } else {
        window.location.href = "/admin";
        return;
      }
    } catch (e: any) {
      setError(e?.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (success === "confirmation") {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{
          backgroundColor: "var(--clay-bg)",
          fontFamily: "var(--clay-font)",
        }}
      >
        <div className="clay-surface w-full max-w-md p-8 text-center sm:p-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--clay-primary)]/10">
            <CheckCircle2 className="h-7 w-7" style={{ color: "var(--clay-primary)" }} />
          </div>
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{ color: "var(--clay-text)" }}
          >
            Check your email
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--clay-muted)" }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your
            account, then sign in.
          </p>
          <button
            type="button"
            className="clay-button mt-6 flex h-12 w-full items-center justify-center text-base font-bold"
            onClick={() => router.navigate({ to: "/login" })}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        backgroundColor: "var(--clay-bg)",
        fontFamily: "var(--clay-font)",
      }}
    >
      <div className="clay-surface w-full max-w-md p-8 sm:p-10">
        <div className="mb-7 text-center">
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{ color: "var(--clay-text)" }}
          >
            Create your account
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--clay-muted)" }}>
            Join Madd Hatter POS Sync.
          </p>
        </div>

        {setupRequired && (
          <Alert variant="destructive" className="mb-4 rounded-2xl border-0">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Setup required</AlertTitle>
            <AlertDescription>
              Add these secrets before registering: {setupRequired.join(", ")}. See the setup guide
              on the home page.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mb-4 rounded-2xl border-0">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label
              htmlFor="fullName"
              style={{ color: "var(--clay-text)" }}
              className="font-semibold"
            >
              Full name
            </Label>
            <Input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              aria-invalid={!!fieldErrors.fullName}
              placeholder="Jane Doe"
              className="clay-inset h-12 border-0 px-5 text-base placeholder:text-[var(--clay-muted)] focus-visible:ring-2 focus-visible:ring-[var(--clay-primary)]/40"
              style={{ color: "var(--clay-text)" }}
            />
            {fieldErrors.fullName && (
              <p className="text-xs text-destructive">{fieldErrors.fullName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="register-email"
              style={{ color: "var(--clay-text)" }}
              className="font-semibold"
            >
              Email
            </Label>
            <Input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-invalid={!!fieldErrors.email}
              placeholder="you@example.com"
              className="clay-inset h-12 border-0 px-5 text-base placeholder:text-[var(--clay-muted)] focus-visible:ring-2 focus-visible:ring-[var(--clay-primary)]/40"
              style={{ color: "var(--clay-text)" }}
            />
            {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="register-password"
              style={{ color: "var(--clay-text)" }}
              className="font-semibold"
            >
              Password
            </Label>
            <div className="relative">
              <Input
                id="register-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                aria-invalid={!!fieldErrors.password}
                placeholder="••••••••"
                className="clay-inset h-12 border-0 px-5 pr-12 text-base placeholder:text-[var(--clay-muted)] focus-visible:ring-2 focus-visible:ring-[var(--clay-primary)]/40"
                style={{ color: "var(--clay-text)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--clay-muted)] hover:text-[var(--clay-text)]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {fieldErrors.password ? (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            ) : (
              <p className="text-xs" style={{ color: "var(--clay-muted)" }}>
                Minimum 8 characters.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="confirm-password"
              style={{ color: "var(--clay-text)" }}
              className="font-semibold"
            >
              Confirm password
            </Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              aria-invalid={!!fieldErrors.confirm}
              placeholder="••••••••"
              className="clay-inset h-12 border-0 px-5 text-base placeholder:text-[var(--clay-muted)] focus-visible:ring-2 focus-visible:ring-[var(--clay-primary)]/40"
              style={{ color: "var(--clay-text)" }}
            />
            {fieldErrors.confirm && (
              <p className="text-xs text-destructive">{fieldErrors.confirm}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="clay-button flex h-12 w-full items-center justify-center gap-2 text-base font-bold disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create account
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--clay-muted)" }}>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-bold underline-offset-2 hover:underline"
            style={{ color: "var(--clay-primary)" }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
