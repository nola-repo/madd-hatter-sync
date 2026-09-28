import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TriangleAlert, Loader2, PlugZap, CheckCircle2, XCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { testSupabaseConnection } from "@/lib/integration/integration.functions";

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
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [setupRequired, setSetupRequired] = useState<string[] | null>(null);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<TestResult["result"] | null>(null);
    const [testSetup, setTestSetup] = useState<string[] | null>(null);
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
                // Successful login: the server set the sb-<ref>-auth-token cookie via
                // Set-Cookie on the /api/auth/login response. Do a hard navigation to
                // /admin so the browser sends that fresh cookie on the document
                // request. The _authenticated layout's beforeLoad runs during SSR
                // (cookie not visible to internal fetches there), renders a brief
                // loading shell, then re-checks /api/auth/me on the client where the
                // cookie IS sent — and renders the dashboard.
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
        <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl">Madd Hatter POS Sync</CardTitle>
                    <CardDescription>
                        Clover to CRM middleware. Sign in with your administrator account.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {setupRequired && (
                        <Alert variant="destructive" className="mb-4">
                            <TriangleAlert className="h-4 w-4" />
                            <AlertTitle>Setup required</AlertTitle>
                            <AlertDescription>
                                Add these secrets before signing in: {setupRequired.join(", ")}. See the setup guide
                                on the home page.
                            </AlertDescription>
                        </Alert>
                    )}
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <TriangleAlert className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Admin email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Sign in
                        </Button>
                    </form>

                    <div className="mt-4 border-t pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled={testing}
                            onClick={onTestConnection}
                        >
                            {testing ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <PlugZap className="mr-2 h-4 w-4" />
                            )}
                            Test Supabase connection
                        </Button>

                        {testSetup && (
                            <Alert variant="destructive" className="mt-3">
                                <TriangleAlert className="h-4 w-4" />
                                <AlertTitle>Setup required</AlertTitle>
                                <AlertDescription>
                                    Add these secrets first: {testSetup.join(", ")}. See the setup guide on the home
                                    page.
                                </AlertDescription>
                            </Alert>
                        )}

                        {testResult && (
                            <Alert
                                variant={
                                    testResult.secretKeyOk && testResult.publishableKeyOk ? "default" : "destructive"
                                }
                                className="mt-3"
                            >
                                {testResult.secretKeyOk && testResult.publishableKeyOk ? (
                                    <CheckCircle2 className="h-4 w-4" />
                                ) : (
                                    <XCircle className="h-4 w-4" />
                                )}
                                <AlertTitle>
                                    {testResult.secretKeyOk && testResult.publishableKeyOk
                                        ? "Supabase connected"
                                        : "Connection problem"}
                                </AlertTitle>
                                <AlertDescription className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm">
                                        <span>
                                            Secret key:{" "}
                                            {testResult.secretKeyOk ? (
                                                <span className="font-medium text-primary">valid</span>
                                            ) : (
                                                <span className="font-medium text-destructive">invalid</span>
                                            )}
                                        </span>
                                        <span className="opacity-40">·</span>
                                        <span>
                                            Publishable key:{" "}
                                            {testResult.publishableKeyOk ? (
                                                <span className="font-medium text-primary">valid</span>
                                            ) : (
                                                <span className="font-medium text-destructive">invalid</span>
                                            )}
                                        </span>
                                    </div>
                                    {testResult.adminUserCount !== null && (
                                        <div className="text-sm">
                                            Admin users found: {testResult.adminUserCount}
                                            {testResult.adminUserCount === 0 && (
                                                <span className="text-destructive">
                                                    {" "}
                                                    — create an admin user in Supabase first.
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    {testResult.detail && (
                                        <div className="text-sm opacity-80">{testResult.detail}</div>
                                    )}
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
