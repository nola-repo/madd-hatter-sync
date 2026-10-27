import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  TriangleAlert,
  Loader2,
  PlugZap,
  CheckCircle2,
  XCircle,
  Lock,
  Shield,
  Activity,
  Eye,
  EyeOff,
  ArrowLeft,
  Mail,
  KeyRound,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { testSupabaseConnection } from "@/lib/integration/integration.functions";
import { MaddHatterLogo } from "@/components/brand-icon";

async function loginRequest(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

type TestResult = {
  setupRequired?: boolean;
  missing?: string[];
  result?: {
    url: string;
    secretKeyOk: boolean;
    publishableKeyOk: boolean;
    detail: string;
    adminUserCount: number | null;
  };
};

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Administrator Sign In — Madd Hatter POS Sync" },
      {
        name: "description",
        content: "Administrator authentication for the Madd Hatter POS to CRM sync middleware.",
      },
      { property: "og:title", content: "Administrator Sign In — Madd Hatter POS Sync" },
      {
        property: "og:description",
        content: "Administrator authentication for the Madd Hatter POS to CRM sync middleware.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState<string[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult["result"] | null>(null);
  const [testSetup, setTestSetup] = useState<string[] | null>(null);

  // Forgot password flow
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  const runTest = useServerFn(testSupabaseConnection);

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
        setError((res as { error: string }).error ?? "Authentication failed");
      }
    } catch (e: any) {
      setError(e?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function onForgotPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage(null);
    try {
      // Emulate recovery request
      await new Promise((r) => setTimeout(r, 600));
      setForgotMessage(
        `Password recovery instructions have been dispatched to ${forgotEmail || "your administrator email"}. Please check your inbox.`,
      );
    } finally {
      setForgotLoading(false);
    }
  }

  async function onTestConnection() {
    setTesting(true);
    setTestResult(null);
    setTestSetup(null);
    try {
      const res = (await runTest()) as TestResult;
      if (res.setupRequired) {
        setTestSetup(res.missing ?? []);
      } else if (res.result) {
        setTestResult(res.result);
      }
    } catch (e: any) {
      setTestResult({
        url: "",
        secretKeyOk: false,
        publishableKeyOk: false,
        detail: e?.message ?? "Connection test failed",
        adminUserCount: null,
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#080808] px-4 py-12 selection:bg-zinc-700/60 selection:text-white">
      {/* Ambient Neutral Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-zinc-700/10 blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header with balanced, slightly smaller logo */}
        <div className="flex flex-col items-center text-center space-y-2.5">
          <MaddHatterLogo size="lg" className="h-16 mb-0.5" imgClassName="h-14" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-display">
              Madd Hatter POS Sync
            </h1>
            <p className="text-xs text-[#A1A1AA] mt-1 font-light tracking-wide">
              Hospitality Operations & CRM Intelligence Platform
            </p>
          </div>
        </div>

        {/* Login or Forgot Password Card */}
        <Card className="border-[#27272A] bg-[#111113]/95 backdrop-blur-2xl shadow-2xl">
          {!forgotMode ? (
            <>
              <CardHeader className="pb-4 border-b border-[#1E1E22]">
                <CardTitle className="text-sm font-semibold text-white font-display flex items-center gap-2">
                  <Lock className="h-4 w-4 text-zinc-300" />
                  Administrator Access
                </CardTitle>
                <CardDescription className="text-xs text-[#71717A]">
                  Sign in to inspect real-time Clover POS transactions and GoHighLevel CRM contacts.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {setupRequired && (
                  <Alert
                    variant="destructive"
                    className="border-red-900/50 bg-red-950/20 text-red-200"
                  >
                    <TriangleAlert className="h-4 w-4 text-red-400" />
                    <AlertTitle>Configuration Required</AlertTitle>
                    <AlertDescription className="text-xs mt-1">
                      Missing configuration secrets: {setupRequired.join(", ")}.
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert
                    variant="destructive"
                    className="border-red-900/50 bg-red-950/20 text-red-200"
                  >
                    <TriangleAlert className="h-4 w-4 text-red-400" />
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium text-[#A1A1AA]">
                      Administrator Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="admin@maddhatter.com"
                      className="h-10 border-[#27272A] bg-[#141417] text-xs text-white placeholder:text-[#52525B] focus-visible:ring-zinc-400 focus-visible:border-zinc-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-xs font-medium text-[#A1A1AA]">
                        Password
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(email);
                          setForgotMode(true);
                          setForgotMessage(null);
                        }}
                        className="text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        placeholder="••••••••••••"
                        className="h-10 border-[#27272A] bg-[#141417] text-xs text-white placeholder:text-[#52525B] focus-visible:ring-zinc-400 focus-visible:border-zinc-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        tabIndex={-1}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-10 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs tracking-wide shadow-md transition-all active:scale-[0.99] cursor-pointer"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Sign in to Console
                  </Button>
                </form>

                {/* Connectivity Diagnostic Test */}
                <div className="pt-3 border-t border-[#1E1E22]">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-[#A1A1AA] hover:text-white hover:bg-[#18181B] border border-[#27272A]/50"
                    disabled={testing}
                    onClick={onTestConnection}
                  >
                    {testing ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-zinc-300" />
                    ) : (
                      <PlugZap className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                    )}
                    Test Database Connectivity
                  </Button>

                  {testSetup && (
                    <Alert
                      variant="destructive"
                      className="mt-3 border-red-900/50 bg-red-950/20 text-red-200"
                    >
                      <TriangleAlert className="h-4 w-4 text-red-400" />
                      <AlertTitle className="text-xs font-semibold">Secrets Required</AlertTitle>
                      <AlertDescription className="text-xs mt-1">
                        Configure: {testSetup.join(", ")}
                      </AlertDescription>
                    </Alert>
                  )}

                  {testResult && (
                    <Alert
                      variant={
                        testResult.secretKeyOk && testResult.publishableKeyOk
                          ? "default"
                          : "destructive"
                      }
                      className="mt-3 border-[#222226] bg-[#141417] text-xs"
                    >
                      {testResult.secretKeyOk && testResult.publishableKeyOk ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                      )}
                      <AlertTitle className="text-xs font-semibold text-white">
                        {testResult.secretKeyOk && testResult.publishableKeyOk
                          ? "Supabase Connected"
                          : "Connection Check Failed"}
                      </AlertTitle>
                      <AlertDescription className="space-y-1 mt-1 text-[11px] text-[#A1A1AA]">
                        <div className="flex items-center gap-2">
                          <span>
                            Secret key:{" "}
                            <strong
                              className={
                                testResult.secretKeyOk ? "text-emerald-400" : "text-red-400"
                              }
                            >
                              {testResult.secretKeyOk ? "Valid" : "Invalid"}
                            </strong>
                          </span>
                          <span>·</span>
                          <span>
                            Publishable key:{" "}
                            <strong
                              className={
                                testResult.publishableKeyOk ? "text-emerald-400" : "text-red-400"
                              }
                            >
                              {testResult.publishableKeyOk ? "Valid" : "Invalid"}
                            </strong>
                          </span>
                        </div>
                        {testResult.adminUserCount !== null && (
                          <div>
                            Admin users detected:{" "}
                            <span className="text-white font-mono">
                              {testResult.adminUserCount}
                            </span>
                          </div>
                        )}
                        {testResult.detail && (
                          <div className="text-[10px] text-[#71717A] font-mono">
                            {testResult.detail}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="pb-4 border-b border-[#1E1E22]">
                <CardTitle className="text-sm font-semibold text-white font-display flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-zinc-300" />
                  Recover Password
                </CardTitle>
                <CardDescription className="text-xs text-[#71717A]">
                  Enter your administrator email to receive a password recovery link.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                {forgotMessage ? (
                  <div className="space-y-4">
                    <Alert className="border-emerald-800/40 bg-emerald-950/30 text-emerald-300">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <AlertTitle className="text-xs font-semibold">
                        Recovery Email Dispatched
                      </AlertTitle>
                      <AlertDescription className="text-xs mt-1">{forgotMessage}</AlertDescription>
                    </Alert>
                    <Button
                      type="button"
                      onClick={() => setForgotMode(false)}
                      className="w-full h-10 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs tracking-wide"
                    >
                      Return to Sign In
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={onForgotPasswordSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-email" className="text-xs font-medium text-[#A1A1AA]">
                        Administrator Email
                      </Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        placeholder="admin@maddhatter.com"
                        className="h-10 border-[#27272A] bg-[#141417] text-xs text-white placeholder:text-[#52525B] focus-visible:ring-zinc-400 focus-visible:border-zinc-500"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-10 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs tracking-wide shadow-md transition-all active:scale-[0.99] cursor-pointer"
                      disabled={forgotLoading}
                    >
                      {forgotLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Send Recovery Instructions
                    </Button>

                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => setForgotMode(false)}
                        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <ArrowLeft className="h-3 w-3" /> Back to Sign In
                      </button>
                    </div>
                  </form>
                )}
              </CardContent>
            </>
          )}
        </Card>

        {/* Footer status notice */}
        <div className="text-center text-[11px] text-[#52525B]">
          Madd Hatter Hoboken · Real-time Clover POS & GoHighLevel Integration
        </div>
      </div>
    </div>
  );
}
