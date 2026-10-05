import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      } else if (res.requiresConfirmation) {
        setSuccess("confirmation");
      } else {
        // Session returned immediately — hard navigate so the fresh cookie is sent.
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
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              We sent a confirmation link to <strong>{email}</strong>. Click it to activate your
              account, then sign in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              className="w-full"
              onClick={() => router.navigate({ to: "/login" })}
            >
              Back to sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Join Madd Hatter POS Sync.</CardDescription>
        </CardHeader>
        <CardContent>
          {setupRequired && (
            <Alert variant="destructive" className="mb-4">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Setup required</AlertTitle>
              <AlertDescription>
                Add these secrets before registering: {setupRequired.join(", ")}. See the setup
                guide on the home page.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
                aria-invalid={!!fieldErrors.fullName}
              />
              {fieldErrors.fullName && (
                <p className="text-xs text-destructive">{fieldErrors.fullName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-email">Email</Label>
              <Input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                aria-invalid={!!fieldErrors.email}
              />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password">Password</Label>
              <div className="relative">
                <Input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  aria-invalid={!!fieldErrors.password}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password ? (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                aria-invalid={!!fieldErrors.confirm}
              />
              {fieldErrors.confirm && (
                <p className="text-xs text-destructive">{fieldErrors.confirm}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
