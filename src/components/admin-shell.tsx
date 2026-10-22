import { useState, useEffect, useCallback } from "react";
import { Link, useRouterState, useRouter } from "@tanstack/react-router";
import {
    LayoutDashboard,
    ShoppingCart,
    CreditCard,
    BarChart3,
    Package,
    Tag,
    Users,
    Settings,
    LogOut,
    Menu,
    X,
    ChevronDown,
    Receipt,
    RefreshCw,
    Terminal,
    ChevronRight,
    SlidersHorizontal,
    PackageCheck,
    UserCheck,
    PanelLeftClose,
    PanelLeft,
    CheckCircle2,
    Shield,
} from "lucide-react";
import { MaddHatterLogo } from "./brand-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSyncContext } from "@/hooks/use-sync-context";
import { useServerFn } from "@tanstack/react-start";
import { getLastSync, refreshPos } from "@/lib/integration/integration.functions";
import type { LastSyncRun, AdminSession } from "@/lib/integration/types";
import { relativeTime } from "@/lib/integration/format";

type NavItem = {
    to: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
};

type NavSection = {
    title: string;
    items: NavItem[];
};

const PRIMARY_NAV: NavItem[] = [
    { to: "/admin", label: "Overview", icon: LayoutDashboard },
    { to: "/admin/orders", label: "Orders", icon: Receipt },
    { to: "/admin/customers", label: "Customers", icon: Users },
    { to: "/admin/purchase-mapping", label: "Purchase Mapping", icon: Tag },
    { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/admin/logs", label: "Sync Logs", icon: Terminal },
    { to: "/admin/settings", label: "Settings", icon: Settings },
];

const SECONDARY_NAV: NavItem[] = [
    { to: "/admin/transactions", label: "Transactions", icon: CreditCard },
    { to: "/admin/customer-purchases", label: "Customer Purchases", icon: ShoppingCart },
    { to: "/admin/product-mapping", label: "Product Mapping", icon: PackageCheck },
    { to: "/admin/items", label: "Item Catalog", icon: Package },
    { to: "/admin/categories", label: "Categories", icon: Tag },
    { to: "/admin/employees", label: "Staff & Employees", icon: UserCheck },
];

export function AdminShell({
    email,
    session,
    onLogout,
    children,
}: {
    email: string | null;
    session?: AdminSession;
    onLogout: () => void;
    children: React.ReactNode;
}) {
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const [mobileOpen, setMobileOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const { bump, isSyncing, setSyncing } = useSyncContext();
    const getLastFn = useServerFn(getLastSync);
    const refreshPosFn = useServerFn(refreshPos);
    const [lastRun, setLastRun] = useState<LastSyncRun>(null);
    const [manualSyncing, setManualSyncing] = useState(false);

    const loadLast = useCallback(async () => {
        try {
            const res = await getLastFn();
            if (!res?.setupRequired) setLastRun(res.last);
        } catch {
            /* ignore */
        }
    }, [getLastFn]);

    useEffect(() => {
        void loadLast();
        const interval = setInterval(() => void loadLast(), 20_000);
        return () => clearInterval(interval);
    }, [loadLast]);

    const handleManualRefresh = async () => {
        if (manualSyncing || isSyncing) return;
        setManualSyncing(true);
        setSyncing(true);
        try {
            await refreshPosFn({ data: { kind: "incremental" } });
            bump();
            await loadLast();
        } catch (e) {
            console.error("Manual sync error:", e);
        } finally {
            setManualSyncing(false);
            setSyncing(false);
        }
    };

    const isActive = (to: string) => {
        if (to === "/admin") return pathname === "/admin";
        return pathname.startsWith(to);
    };

    // Breadcrumb generator
    const getPageTitle = () => {
        if (pathname === "/admin") return "Overview";
        if (pathname.startsWith("/admin/orders")) return "Orders";
        if (pathname.startsWith("/admin/customers")) return "Customers";
        if (pathname.startsWith("/admin/purchase-mapping")) return "Purchase Mapping";
        if (pathname.startsWith("/admin/analytics")) return "Analytics";
        if (pathname.startsWith("/admin/logs")) return "Sync Logs";
        if (pathname.startsWith("/admin/settings")) return "Settings";
        if (pathname.startsWith("/admin/transactions")) return "Transactions";
        if (pathname.startsWith("/admin/customer-purchases")) return "Customer Purchases";
        if (pathname.startsWith("/admin/product-mapping")) return "Product Mapping";
        if (pathname.startsWith("/admin/items")) return "Item Catalog";
        if (pathname.startsWith("/admin/categories")) return "Categories";
        if (pathname.startsWith("/admin/employees")) return "Staff & Employees";
        if (pathname.startsWith("/admin/setup")) return "Setup";
        return "Admin";
    };

    const renderNavLink = (item: NavItem, collapsed: boolean) => {
        const Icon = item.icon;
        const active = isActive(item.to);

        return (
            <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                    active
                        ? "bg-[#1C1C20] text-[#F5F5F5] font-semibold shadow-xs"
                        : "text-[#A1A1AA] hover:bg-[#141416] hover:text-[#F5F5F5]",
                    collapsed && "justify-center px-2 py-2.5",
                )}
            >
                {/* Active indicator bar on left - neutral off-white */}
                {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-zinc-200" />
                )}
                <Icon
                    className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        active ? "text-white" : "text-[#71717A] group-hover:text-[#F5F5F5]",
                    )}
                />
                {!collapsed && (
                    <span className="truncate">{item.label}</span>
                )}
                {!collapsed && item.badge && (
                    <span className="ml-auto rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300 border border-zinc-700">
                        {item.badge}
                    </span>
                )}
            </Link>
        );
    };

    const brandHeader = (collapsed: boolean) => (
        <div className={cn("px-4 py-5 sm:py-6 border-b border-[#1E1E22]", collapsed ? "px-2 py-4 sm:py-5 flex justify-center" : "")}>
            <Link
                to="/admin"
                className={cn(
                    "group flex items-center transition-all",
                    collapsed ? "justify-center" : "gap-3",
                )}
            >
                <MaddHatterLogo
                    size={collapsed ? "sm" : "default"}
                    className={cn(collapsed ? "h-9" : "h-10", "transition-transform group-hover:scale-105 shrink-0")}
                />
                {!collapsed && (
                    <div className="flex flex-col leading-tight min-w-0">
                        <span className="text-[10px] font-bold tracking-widest text-[#A1A1AA] uppercase font-display truncate">
                            Madd Hatter
                        </span>
                        <span className="text-sm font-extrabold tracking-wider text-[#F5F5F5] uppercase font-display truncate">
                            POS SYNC
                        </span>
                        <span className="text-[10px] text-[#71717A] tracking-wider uppercase font-medium truncate">
                            Hoboken Middleware
                        </span>
                    </div>
                )}
            </Link>
        </div>
    );

    const sidebarContent = (collapsed: boolean) => (
        <div className="flex h-full flex-col justify-between overflow-y-auto">
            <div>
                {brandHeader(collapsed)}

                {/* Primary Navigation */}
                <div className="px-3 pt-3">
                    {!collapsed && (
                        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#52525B]">
                            Core Console
                        </p>
                    )}
                    <nav className="flex flex-col gap-0.5">
                        {PRIMARY_NAV.map((item) => renderNavLink(item, collapsed))}
                    </nav>
                </div>

                {/* Secondary Navigation (Operations & Catalog) - Flat list, not a dropdown */}
                <div className="px-3 pt-4">
                    {!collapsed && (
                        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#52525B]">
                            Operations & Catalog
                        </p>
                    )}
                    <nav className="flex flex-col gap-0.5">
                        {SECONDARY_NAV.map((item) => renderNavLink(item, collapsed))}
                    </nav>
                </div>
            </div>

            {/* User footer with direct navigation to Settings > Profile Settings */}
            <div className="border-t border-[#1E1E22] p-3 bg-[#0A0A0C]">
                {!collapsed ? (
                    <div className="space-y-2">
                        <Link
                            to="/admin/settings"
                            search={{ tab: "profile" }}
                            onClick={() => setMobileOpen(false)}
                            className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-[#141417] hover:bg-[#1C1C21] border border-[#222226] hover:border-zinc-700 transition-all cursor-pointer group"
                            title="Open Profile Settings"
                        >
                            <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-white group-hover:border-zinc-500 transition-colors shrink-0">
                                {(session?.fullName || email || "A").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="truncate text-xs font-medium text-[#E4E4E7] group-hover:text-white transition-colors">
                                    {session?.fullName || email || "Administrator"}
                                </p>
                                <p className="truncate text-[10px] text-zinc-400 font-mono">
                                    {email || session?.email || "admin"}
                                </p>
                            </div>
                            <Settings className="h-3.5 w-3.5 text-zinc-400 group-hover:text-white transition-colors shrink-0" />
                        </Link>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-xs text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] border border-[#27272A]/50"
                            onClick={onLogout}
                        >
                            <LogOut className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                            Sign Out
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <Link
                            to="/admin/settings"
                            search={{ tab: "profile" }}
                            onClick={() => setMobileOpen(false)}
                            className="w-full flex items-center justify-center p-2 text-zinc-400 hover:text-white hover:bg-[#18181B] rounded-lg transition-colors cursor-pointer"
                            title="Open Profile Settings"
                        >
                            <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-white">
                                {(session?.fullName || email || "A").charAt(0).toUpperCase()}
                            </div>
                        </Link>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="w-full text-[#A1A1AA] hover:text-white"
                            onClick={onLogout}
                            title="Sign Out"
                        >
                            <LogOut className="h-4 w-4 text-zinc-400" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#080808] text-[#F5F5F5] flex flex-col">
            {/* Desktop Persistent Sidebar */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-30 hidden lg:flex flex-col border-r border-[#1E1E22] bg-[#0A0A0C] transition-all duration-200",
                    sidebarCollapsed ? "w-16" : "w-64",
                )}
            >
                {sidebarContent(sidebarCollapsed)}
            </aside>

            {/* Mobile Navigation Header */}
            <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[#1E1E22] bg-[#0A0A0C]/95 backdrop-blur-md px-4 lg:hidden">
                <Link to="/admin" className="flex items-center gap-2.5">
                    <MaddHatterLogo size="sm" className="h-8" />
                    <div className="flex flex-col leading-none">
                        <span className="text-[9px] font-bold tracking-wider text-[#A1A1AA] uppercase font-display">
                            Madd Hatter
                        </span>
                        <span className="text-xs font-extrabold tracking-wider text-white uppercase font-display">
                            POS SYNC
                        </span>
                    </div>
                </Link>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#A1A1AA] hover:text-white"
                        onClick={handleManualRefresh}
                        disabled={manualSyncing || isSyncing}
                    >
                        <RefreshCw className={cn("h-4 w-4", (manualSyncing || isSyncing) && "animate-spin text-zinc-300")} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-[#A1A1AA] hover:text-white"
                        onClick={() => setMobileOpen(true)}
                        aria-label="Open navigation menu"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                </div>
            </header>

            {/* Mobile Navigation Drawer */}
            {mobileOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-xs transition-opacity"
                        onClick={() => setMobileOpen(false)}
                    />
                    <aside className="fixed inset-y-0 left-0 flex w-72 flex-col border-r border-[#222226] bg-[#0A0A0C] shadow-2xl">
                        <div className="flex items-center justify-between p-3 border-b border-[#1E1E22]">
                            <span className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider">
                                Navigation
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-[#A1A1AA] hover:text-white"
                                onClick={() => setMobileOpen(false)}
                                aria-label="Close menu"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        {sidebarContent(false)}
                    </aside>
                </div>
            )}

            {/* Main Content Area */}
            <div
                className={cn(
                    "flex-1 flex flex-col transition-all duration-200",
                    sidebarCollapsed ? "lg:pl-16" : "lg:pl-64",
                )}
            >
                {/* Desktop Top Bar */}
                <header className="sticky top-0 z-20 hidden lg:flex h-14 items-center justify-between border-b border-[#1E1E22] bg-[#0A0A0C]/90 backdrop-blur-md px-6">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[#71717A] hover:text-white hover:bg-[#141416]"
                            onClick={() => setSidebarCollapsed((c) => !c)}
                            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {sidebarCollapsed ? (
                                <PanelLeft className="h-4 w-4" />
                            ) : (
                                <PanelLeftClose className="h-4 w-4" />
                            )}
                        </Button>
                        <div className="flex items-center gap-2 text-sm text-[#71717A]">
                            <span className="hover:text-[#A1A1AA] transition-colors">Admin</span>
                            <ChevronRight className="h-3.5 w-3.5 text-[#3F3F46]" />
                            <span className="font-semibold text-[#F5F5F5] font-display">
                                {getPageTitle()}
                            </span>
                        </div>
                    </div>

                    {/* Top Bar Actions & Real-Time Sync Status - Clean neutral indicator */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#111113] border border-[#222226] text-xs">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                            <span className="text-[11px] text-[#A1A1AA]">
                                Background Sync: <strong className="text-white font-medium">Active (2m)</strong>
                            </span>
                            {lastRun?.finishedAt && (
                                <span className="text-[10px] text-[#71717A] border-l border-[#27272A] pl-2 ml-1">
                                    Last synced: {relativeTime(new Date(lastRun.finishedAt).getTime())}
                                </span>
                            )}
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleManualRefresh}
                            disabled={manualSyncing || isSyncing}
                            className="h-8 gap-1.5 border-[#27272A] bg-[#111113] text-xs text-[#E4E4E7] hover:bg-[#1A1A1E] hover:text-white hover:border-zinc-700 transition-all shadow-xs"
                        >
                            <RefreshCw
                                className={cn(
                                    "h-3.5 w-3.5 text-zinc-400",
                                    (manualSyncing || isSyncing) && "animate-spin text-white",
                                )}
                            />
                            {manualSyncing || isSyncing ? "Syncing POS…" : "Sync / Refresh"}
                        </Button>
                    </div>
                </header>

                {/* Main Content Viewport */}
                <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 max-w-7xl w-full mx-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
