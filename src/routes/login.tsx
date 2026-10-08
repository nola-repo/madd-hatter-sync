import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TriangleAlert, Loader2 } from "lucide-react";

async function loginRequest(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Admin Sign In — Madd Hatter POS Sync" },
      {
        name: "description",
        content: "Administrator sign in for the Clover to CRM sync dashboard.",
      },
      { property: "og:title", content: "Admin Sign In — Madd Hatter POS Sync" },
      {
        property: "og:description",
        content: "Administrator sign in for the Clover to CRM sync dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState<string[] | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSetupRequired(null);
    try {
      const res = await loginRequest(email, password);
      if ((res as { setupRequired?: boolean }).setupRequired) {
        setSetupRequired((res as { missing: string[] }).missing);
      } else if ((res as { ok: boolean }).ok) {
        window.location.href = "/admin";
        return;
      } else {
        setError((res as { error: string }).error ?? "Login failed");
      }
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
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
            Madd Hatter POS Sync
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--clay-muted)" }}>
            Clover to CRM middleware. Sign in with your administrator account.
          </p>
        </div>

        {setupRequired && (
          <Alert variant="destructive" className="mb-4 rounded-2xl border-0">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>Setup required</AlertTitle>
            <AlertDescription>
              Add these secrets before signing in: {setupRequired.join(", ")}. See the setup guide
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

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" style={{ color: "var(--clay-text)" }} className="font-semibold">
              Admin email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="clay-inset h-12 border-0 px-5 text-base placeholder:text-[var(--clay-muted)] focus-visible:ring-2 focus-visible:ring-[var(--clay-primary)]/40"
              style={{ color: "var(--clay-text)" }}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="password"
              style={{ color: "var(--clay-text)" }}
              className="font-semibold"
            >
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="clay-inset h-12 border-0 px-5 text-base placeholder:text-[var(--clay-muted)] focus-visible:ring-2 focus-visible:ring-[var(--clay-primary)]/40"
              style={{ color: "var(--clay-text)" }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="clay-button flex h-12 w-full items-center justify-center gap-2 text-base font-bold disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-sm" style={{ color: "var(--clay-muted)" }}>
          Don't have an account?{" "}
          <Link
            to="/register"
            className="font-bold underline-offset-2 hover:underline"
            style={{ color: "var(--clay-primary)" }}
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
