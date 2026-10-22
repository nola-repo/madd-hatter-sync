import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SchemaSection } from "@/components/schema-section";
import { DiagnosticPayload } from "@/components/diagnostic-payload";
import { SyncControl } from "@/components/sync-control";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
    CheckCircle2,
    XCircle,
    Loader2,
    RefreshCw,
    TriangleAlert,
    Shield,
    Database,
    Store,
    Layers,
    ExternalLink,
    Lock,
    User,
    Bell,
    Settings as SettingsIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getConnectionStatus, getSchemaStatus } from "@/lib/integration/integration.functions";
import { getUserProfile, updateUserProfile } from "@/lib/integration/auth.functions";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import type {
    ConnectionStatus,
    CloverConnectionDetail,
    GhlConnectionDetail,
} from "@/lib/integration/types";
import { useSyncContext, useSyncVersion } from "@/hooks/use-sync-context";

export function SettingsPage() {
    const getStatusFn = useServerFn(getConnectionStatus);
    const getSchemaFn = useServerFn(getSchemaStatus);
    const syncVersion = useSyncVersion();
    const { bump } = useSyncContext();

    const [status, setStatus] = useState<ConnectionStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);
    const [setupRequired, setSetupRequired] = useState<string[] | null>(null);
    const [schema, setSchema] = useState<any>(null);
    const searchParams = useRouterState({
        select: (s) => (s.location.search as { tab?: string }) ?? {},
    });

    const [activeTab, setActiveTab] = useState<"system" | "profile">(() => {
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            if (params.get("tab") === "profile") return "profile";
        }
        return "system";
    });

    useEffect(() => {
        if (searchParams?.tab === "profile") {
            setActiveTab("profile");
        } else if (searchParams?.tab === "system") {
            setActiveTab("system");
        }
    }, [searchParams?.tab]);

    const handleTabChange = (v: string) => {
        const next = v as "system" | "profile";
        setActiveTab(next);
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("tab", next);
            window.history.replaceState({}, "", url.toString());
        }
    };

    const loadStatus = useCallback(async () => {
        setStatusLoading(true);
        setSetupRequired(null);
        try {
            const res = await getStatusFn();
            if (res?.setupRequired) {
                setSetupRequired((res as any).missing);
            } else {
                setStatus(res as ConnectionStatus);
            }
        } catch (e: any) {
            setSetupRequired([e?.message ?? "Failed to load status"]);
        } finally {
            setStatusLoading(false);
        }
    }, [getStatusFn]);

    const loadSchema = useCallback(async () => {
        try {
            const res = await getSchemaFn();
            if (!res?.setupRequired) setSchema(res);
        } catch {
            /* schema optional */
        }
    }, [getSchemaFn]);

    useEffect(() => {
        loadStatus();
        loadSchema();
    }, [loadStatus, loadSchema, syncVersion]);

    if (setupRequired) {
        return (
            <div className="space-y-4">
                <PageHeader title="Settings" description="Connection and integration configuration" />
                <Alert variant="destructive" className="border-red-900/50 bg-red-950/20 text-red-200">
                    <TriangleAlert className="h-4 w-4 text-red-400" />
                    <AlertTitle>Configuration Required</AlertTitle>
                    <AlertDescription>
                        Required credentials missing:{" "}
                        <strong className="font-mono text-white">
                            {(setupRequired as string[]).filter((s) => !s.includes("Failed")).join(", ")}
                        </strong>
                        . Configure your environment secrets, then refresh.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <PageHeader
                title="Settings & Preferences"
                description="Manage POS ingestion controls, upstream API credentials, and administrative profile preferences."
                actions={
                    activeTab === "system" && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                bump();
                                loadStatus();
                                loadSchema();
                            }}
                            disabled={statusLoading}
                            className="border-[#27272A] bg-[#141417] text-xs hover:bg-[#1E1E24]"
                        >
                            {statusLoading ? (
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                            )}
                            Re-check Connections
                        </Button>
                    )
                }
            />

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="bg-[#141417] border border-[#222226] p-1 h-10 mb-6">
                    <TabsTrigger
                        value="system"
                        className="gap-2 text-xs data-[state=active]:bg-[#202025] data-[state=active]:text-white font-medium"
                    >
                        <SettingsIcon className="h-3.5 w-3.5" />
                        System & Integrations
                    </TabsTrigger>
                    <TabsTrigger
                        value="profile"
                        className="gap-2 text-xs data-[state=active]:bg-[#202025] data-[state=active]:text-white font-medium"
                    >
                        <User className="h-3.5 w-3.5" />
                        Profile Settings
                    </TabsTrigger>
                </TabsList>

                {/* Tab 1: System & Integrations */}
                <TabsContent value="system" className="space-y-8 mt-0">
                    {/* Pipeline Controls */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-zinc-300" />
                            <h2 className="text-base font-bold text-white font-display">
                                POS Data Synchronization Pipeline
                            </h2>
                        </div>
                        <SyncControl />
                    </div>

                    {/* Integration Connections */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-emerald-400" />
                                <h2 className="text-base font-bold text-white font-display">
                                    Integration Connectivity
                                </h2>
                            </div>
                            <span className="text-xs text-[#71717A]">Active API Heartbeats</span>
                        </div>

                        {statusLoading && !status ? (
                            <div className="grid gap-4 lg:grid-cols-3">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="rounded-xl border border-[#222226] bg-[#111113] p-5 shadow-lg space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
                                            <div className="h-5 w-16 bg-zinc-800/80 rounded-full animate-pulse" />
                                        </div>
                                        <div className="space-y-2 pt-1">
                                            <div className="h-3 w-44 bg-zinc-800/60 rounded animate-pulse" />
                                            <div className="h-3 w-28 bg-zinc-800/40 rounded animate-pulse" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : status ? (
                            <div className="grid gap-4 lg:grid-cols-3">
                                <ConnectionCard label="Supabase Middleware" status={status.supabase} />
                                <CloverConnectionCard status={status.clover} />
                                <GhlConnectionCard status={status.ghl} />
                            </div>
                        ) : (
                            <div className="text-xs text-[#71717A]">Connection details unavailable.</div>
                        )}
                    </div>

                    {/* CRM Schema Specification */}
                    {schema && (
                        <div className="space-y-3 pt-2">
                            <div className="flex items-center gap-2">
                                <Database className="h-4 w-4 text-blue-400" />
                                <h2 className="text-base font-bold text-white font-display">
                                    GoHighLevel Custom Object: “POS Purchase Item”
                                </h2>
                            </div>
                            <Card className="border-[#222226] bg-[#111113] shadow-lg">
                                <CardHeader className="pb-3 border-b border-[#1E1E22]">
                                    <CardTitle className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider font-display">
                                        Schema Definition & Field Mappings
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <SchemaSection schema={schema} locationId={status?.ghl?.locationId} />
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                {/* Tab 2: Profile Settings */}
                <TabsContent value="profile" className="mt-0">
                    <ProfileSettingsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function ProfileSettingsTab() {
    const getProfileFn = useServerFn(getUserProfile);
    const updateProfileFn = useServerFn(updateUserProfile);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState("Administrator");
    const [email, setEmail] = useState("");
    const [timezone, setTimezone] = useState("America/New_York (Hoboken / Eastern)");
    const [role, setRole] = useState("Super Administrator");
    const [createdAt, setCreatedAt] = useState<string | null>(null);
    const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [savedProfile, setSavedProfile] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Notifications
    const [syncAlerts, setSyncAlerts] = useState(true);
    const [reconciliationDigest, setReconciliationDigest] = useState(true);
    const [tagAuditWarnings, setTagAuditWarnings] = useState(false);

    // Password fields
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordStatus, setPasswordStatus] = useState<{
        type: "success" | "error" | null;
        message: string;
    }>({ type: null, message: "" });
    const [updatingPassword, setUpdatingPassword] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getProfileFn()
            .then((res) => {
                if (cancelled) return;
                if (res?.ok && res.profile) {
                    setName(res.profile.fullName);
                    setEmail(res.profile.email);
                    setTimezone(res.profile.timezone);
                    setRole(res.profile.role);
                    setCreatedAt(res.profile.createdAt);
                    setLastSignInAt(res.profile.lastSignInAt);
                    setUserId(res.profile.userId);
                    setSyncAlerts(res.profile.syncAlerts);
                    setReconciliationDigest(res.profile.reconciliationDigest);
                    setTagAuditWarnings(res.profile.tagAuditWarnings);
                }
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e?.message ?? "Failed to fetch credentials from database");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [getProfileFn]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
            const res = await updateProfileFn({
                data: {
                    fullName: name,
                    timezone,
                    syncAlerts,
                    reconciliationDigest,
                    tagAuditWarnings,
                },
            });
            if (res.ok) {
                setSavedProfile(true);
                setTimeout(() => setSavedProfile(false), 3500);
            } else {
                setError(res.error || "Failed to save profile preferences in database.");
            }
        } catch (e: any) {
            setError(e?.message ?? "Failed to save profile");
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 8) {
            setPasswordStatus({
                type: "error",
                message: "New password must contain at least 8 characters.",
            });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordStatus({ type: "error", message: "New passwords do not match." });
            return;
        }
        setUpdatingPassword(true);
        setPasswordStatus({ type: null, message: "" });
        try {
            const res = await updateProfileFn({ data: { newPassword } });
            if (res.ok) {
                setPasswordStatus({
                    type: "success",
                    message: "Database authentication updated. Your new password is now active.",
                });
                setNewPassword("");
                setConfirmPassword("");
                setTimeout(() => setPasswordStatus({ type: null, message: "" }), 5000);
            } else {
                setPasswordStatus({ type: "error", message: res.error || "Failed to update password." });
            }
        } catch (e: any) {
            setPasswordStatus({ type: "error", message: e?.message ?? "Password update failed." });
        } finally {
            setUpdatingPassword(false);
        }
    };

    if (loading) {
        return (
            <div className="grid gap-6 lg:grid-cols-3">
                <Card className="border-[#222226] bg-[#111113] lg:col-span-2 p-6 space-y-6">
                    <div className="flex items-center gap-4 pb-4 border-b border-[#1E1E22]">
                        <div className="h-14 w-14 rounded-full bg-zinc-800 animate-pulse" />
                        <div className="space-y-2 flex-1">
                            <div className="h-4 w-40 bg-zinc-800 rounded animate-pulse" />
                            <div className="h-3 w-56 bg-zinc-800/60 rounded animate-pulse" />
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="space-y-2">
                                <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
                                <div className="h-9 w-full bg-zinc-800/40 rounded animate-pulse" />
                            </div>
                        ))}
                    </div>
                </Card>
                <Card className="border-[#222226] bg-[#111113] p-6 space-y-4">
                    <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
                    <div className="space-y-3 pt-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-12 w-full bg-zinc-800/40 rounded animate-pulse" />
                        ))}
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {savedProfile && (
                <Alert className="border-emerald-800/40 bg-emerald-950/30 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <AlertTitle>Profile Updated</AlertTitle>
                    <AlertDescription className="text-xs">
                        Your profile settings and notification preferences have been saved to the database.
                    </AlertDescription>
                </Alert>
            )}

            {error && (
                <Alert variant="destructive" className="border-red-900/50 bg-red-950/20 text-red-200">
                    <TriangleAlert className="h-4 w-4 text-red-400" />
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
                {/* Profile Overview & Info */}
                <Card className="border-[#222226] bg-[#111113] lg:col-span-2">
                    <CardHeader className="pb-3 border-b border-[#1E1E22]">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-zinc-300" />
                                <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
                                    Account Profile (Database Verified)
                                </CardTitle>
                            </div>
                            <Badge variant="outline" className="border-zinc-800 bg-zinc-900/60 text-[10px] font-mono text-zinc-400">
                                {role === "authenticated" || !role ? "Administrator" : role}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-5">
                        <form onSubmit={handleSaveProfile} className="space-y-4">
                            <div className="flex items-center gap-4 pb-4 border-b border-[#1E1E22]">
                                <div className="h-14 w-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg font-bold text-white font-display">
                                    {name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-semibold text-white">{name}</h3>
                                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">{email}</p>
                                    {userId && (
                                        <p className="text-[10px] font-mono text-[#52525B] mt-0.5 truncate">
                                            User ID: {userId}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-[#A1A1AA]">Full Name</label>
                                    <Input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="h-9 border-[#27272A] bg-[#141417] text-xs text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-[#A1A1AA]">Email (Database Auth)</label>
                                    <Input
                                        type="email"
                                        disabled
                                        value={email}
                                        className="h-9 border-[#27272A] bg-[#141417]/50 text-xs text-zinc-400 cursor-not-allowed"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-[#A1A1AA]">Venue Timezone</label>
                                    <Input
                                        value={timezone}
                                        onChange={(e) => setTimezone(e.target.value)}
                                        className="h-9 border-[#27272A] bg-[#141417] text-xs text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-[#A1A1AA]">Role & Access</label>
                                    <Input
                                        disabled
                                        value={`${role === "authenticated" || !role ? "Administrator" : role} (Full POS/CRM Access)`}
                                        className="h-9 border-[#27272A] bg-[#141417]/50 text-xs text-zinc-400 cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            <div className="pt-2 flex justify-end">
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={saving}
                                    className="bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs h-9 shadow-xs"
                                >
                                    {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                    Save Profile Preferences
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>

                {/* Notification Preferences */}
                <Card className="border-[#222226] bg-[#111113]">
                    <CardHeader className="pb-3 border-b border-[#1E1E22]">
                        <div className="flex items-center gap-2">
                            <Bell className="h-4 w-4 text-zinc-300" />
                            <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
                                Alerts & Digest
                            </CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-5 space-y-4">
                        <div className="flex items-center justify-between space-x-2">
                            <div className="space-y-0.5">
                                <p className="text-xs font-medium text-white">Sync Failure Alerts</p>
                                <p className="text-[11px] text-[#71717A]">Immediate notification on Clover/CRM errors</p>
                            </div>
                            <Switch checked={syncAlerts} onCheckedChange={setSyncAlerts} />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <div className="space-y-0.5">
                                <p className="text-xs font-medium text-white">Daily Reconciliation</p>
                                <p className="text-[11px] text-[#71717A]">POS vs Middleware audit digest</p>
                            </div>
                            <Switch checked={reconciliationDigest} onCheckedChange={setReconciliationDigest} />
                        </div>
                        <div className="flex items-center justify-between space-x-2">
                            <div className="space-y-0.5">
                                <p className="text-xs font-medium text-white">CRM Tag Warnings</p>
                                <p className="text-[11px] text-[#71717A]">Notify if purchase tags fail to push</p>
                            </div>
                            <Switch checked={tagAuditWarnings} onCheckedChange={setTagAuditWarnings} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Security & Password Update */}
            <Card className="border-[#222226] bg-[#111113]">
                <CardHeader className="pb-3 border-b border-[#1E1E22]">
                    <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-zinc-300" />
                        <CardTitle className="text-sm font-semibold text-[#F5F5F5] font-display">
                            Security Credentials & Password
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="pt-5">
                    {passwordStatus.message && (
                        <Alert
                            variant={passwordStatus.type === "error" ? "destructive" : "default"}
                            className={cn(
                                "mb-4",
                                passwordStatus.type === "error"
                                    ? "border-red-900/50 bg-red-950/20 text-red-200"
                                    : "border-emerald-800/40 bg-emerald-950/30 text-emerald-300",
                            )}
                        >
                            {passwordStatus.type === "error" ? (
                                <TriangleAlert className="h-4 w-4 text-red-400" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            )}
                            <AlertDescription className="text-xs">
                                {passwordStatus.message}
                            </AlertDescription>
                        </Alert>
                    )}

                    <form onSubmit={handlePasswordChange} className="space-y-4 max-w-xl">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[#A1A1AA]">New Password (min 8 chars)</label>
                                <Input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Minimum 8 characters"
                                    className="h-9 border-[#27272A] bg-[#141417] text-xs text-white"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[#A1A1AA]">Confirm New Password</label>
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter new password"
                                    className="h-9 border-[#27272A] bg-[#141417] text-xs text-white"
                                />
                            </div>
                        </div>

                        <div className="pt-2">
                            <Button
                                type="submit"
                                size="sm"
                                disabled={updatingPassword || !newPassword}
                                className="bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs h-9 shadow-xs"
                            >
                                {updatingPassword && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                Update Password in Database
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

function ConnectionCard({
    label,
    status,
}: {
    label: string;
    status: { connected: boolean; detail: string };
}) {
    return (
        <div className="rounded-xl border border-[#222226] bg-[#111113] p-5 shadow-lg flex flex-col justify-between">
            <div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {status.connected ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                            <XCircle className="h-4 w-4 text-red-400" />
                        )}
                        <span className="text-sm font-semibold text-white font-display">{label}</span>
                    </div>
                    <Badge
                        variant="outline"
                        className={
                            status.connected
                                ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400 text-[10px]"
                                : "border-red-800/40 bg-red-950/40 text-red-400 text-[10px]"
                        }
                    >
                        {status.connected ? "Active" : "Disconnected"}
                    </Badge>
                </div>
                <p className="mt-3 text-xs text-[#A1A1AA] leading-relaxed">{status.detail}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-[#1E1E22] flex items-center justify-between text-[11px] text-[#71717A]">
                <span>Type: PostgreSQL RLS</span>
                <span className="font-mono">Port 5432 / HTTPS</span>
            </div>
        </div>
    );
}

function CloverConnectionCard({ status }: { status: CloverConnectionDetail }) {
    const probeRow = (label: string, ok: boolean | null) => (
        <div className="flex items-center justify-between text-xs py-1">
            <span className="text-[#A1A1AA]">{label}</span>
            <div className="flex items-center gap-1.5">
                {ok === true ? (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> OK (200)
                    </span>
                ) : ok === false ? (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-red-400">
                        <XCircle className="h-3 w-3" /> Failed
                    </span>
                ) : (
                    <Loader2 className="h-3 w-3 text-[#71717A] animate-spin" />
                )}
            </div>
        </div>
    );

    return (
        <div className="rounded-xl border border-[#222226] bg-[#111113] p-5 shadow-lg">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {status.connected ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className="text-sm font-semibold text-white font-display">Clover POS API</span>
                </div>
                <Badge variant="outline" className="text-[10px] border-zinc-700 bg-zinc-900">
                    {status.environment}
                </Badge>
            </div>

            <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                    <span className="text-[#71717A]">Merchant:</span>
                    <span className="font-medium text-white">{status.merchantName ?? "Madd Hatter Hoboken"}</span>
                </div>
                <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#71717A] font-sans">Merchant ID:</span>
                    <span className="text-[#D4D4D8]">{status.merchantId}</span>
                </div>
                <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#71717A] font-sans">HTTP Response:</span>
                    <span className={status.connected ? "text-emerald-400" : "text-red-400"}>
                        {status.httpStatus ?? "200 OK"}
                    </span>
                </div>
            </div>

            {status.connected && (
                <div className="mt-3 space-y-0.5 border-t border-[#1E1E22] pt-2 divide-y divide-[#1A1A1E]">
                    {probeRow("Merchant Info", status.validation.merchantApi)}
                    {probeRow("Orders Ingestion", status.validation.ordersApi)}
                    {probeRow("Customer Registry", status.validation.customersApi)}
                    {probeRow("Payments API", status.validation.paymentsApi)}
                    {probeRow("Inventory & Items", status.validation.inventoryApi)}
                </div>
            )}

            {!status.connected && (
                <p className="mt-3 text-xs text-red-400 font-mono">{status.detail}</p>
            )}

            <div className="mt-3 pt-2 border-t border-[#1E1E22]">
                <DiagnosticPayload d={status.diagnostic} />
            </div>
        </div>
    );
}

function GhlConnectionCard({ status }: { status: GhlConnectionDetail }) {
    return (
        <div className="rounded-xl border border-[#222226] bg-[#111113] p-5 shadow-lg">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {status.connected ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                        <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className="text-sm font-semibold text-white font-display">
                        GoHighLevel CRM
                    </span>
                </div>
                <Badge variant="outline" className="text-[10px] border-zinc-700 bg-zinc-900">
                    LeadConnector
                </Badge>
            </div>

            <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#71717A] font-sans">Location ID:</span>
                    <span className="text-[#D4D4D8] truncate max-w-[150px]">{status.locationId}</span>
                </div>
                <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-[#71717A] font-sans">Auth Status:</span>
                    <span className={status.connected ? "text-emerald-400" : "text-red-400"}>
                        {status.httpStatus ? `HTTP ${status.httpStatus}` : "Verified"}
                    </span>
                </div>
            </div>

            <p className="mt-3 text-xs text-[#A1A1AA] leading-relaxed">{status.detail}</p>

            <div className="mt-4 pt-3 border-t border-[#1E1E22]">
                <DiagnosticPayload d={status.diagnostic} />
            </div>
        </div>
    );
}
