import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
    LayoutDashboard,
    ShoppingCart,
    CreditCard,
    BarChart3,
    Package,
    Tag,
    SlidersHorizontal,
    Users,
    Settings,
    LogOut,
    Menu,
    X,
    ChevronDown,
    Receipt,
    TrendingUp,
} from "lucide-react";
import { HatIcon } from "./brand-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavLeaf = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    children: NavLeaf[];
};
type NavEntry = NavLeaf | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
    return (e as NavGroup).children !== undefined;
}

const NAV: NavEntry[] = [
    { to: "/admin", label: "Home", icon: LayoutDashboard },
    {
        label: "Sales Activity",
        icon: ShoppingCart,
        children: [
            { to: "/admin/orders", label: "Orders", icon: Receipt },
            { to: "/admin/transactions", label: "Transactions", icon: CreditCard },
        ],
    },
    {
        label: "Reports",
        icon: BarChart3,
        children: [
            { to: "/admin/analytics", label: "Sales Overview", icon: TrendingUp },
            { to: "/admin/products", label: "Item Sales", icon: Package },
        ],
    },
    {
        label: "Items",
        icon: Package,
        children: [
            { to: "/admin/items", label: "Item List", icon: Package },
            { to: "/admin/categories", label: "Categories", icon: Tag },
            { to: "/admin/modifiers", label: "Modifier Groups", icon: SlidersHorizontal },
        ],
    },
    { to: "/admin/employees", label: "Employees", icon: Users },
    { to: "/admin/customers", label: "Customers", icon: Users },
    { to: "/admin/customer-purchases", label: "Customer Purchases", icon: ShoppingCart },
    { to: "/admin/product-mapping", label: "Product Mapping", icon: Package },
    { to: "/admin/purchase-mapping", label: "Purchase Mapping", icon: Tag },
    { to: "/admin/logs", label: "Sync Logs", icon: Receipt },
    { to: "/admin/settings", label: "Settings", icon: Settings },
];

// Routes that exist as real pages vs "coming soon" placeholders.
const COMING_SOON = new Set<string>(["/admin/modifiers"]);

export function AdminShell({
    email,
    onLogout,
    children,
}: {
    email: string | null;
    onLogout: () => void;
    children: React.ReactNode;
}) {
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const [mobileOpen, setMobileOpen] = useState(false);
    // Expand a group if any child is active.
    const initiallyExpanded = NAV.map((e, i) =>
        isGroup(e) && e.children.some((c) => pathname.startsWith(c.to)) ? i : -1,
    ).filter((i) => i >= 0);
    const [expanded, setExpanded] = useState<Set<number>>(new Set(initiallyExpanded));

    const isActive = (to: string) =>
        to === "/admin" ? pathname === "/admin" : pathname.startsWith(to);

    const toggleGroup = (i: number) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
        });

    const renderItem = (entry: NavEntry, index: number) => {
        if (isGroup(entry)) {
            const Icon = entry.icon;
            const open = expanded.has(index);
            const hasActiveChild = entry.children.some((c) => isActive(c.to));
            return (
                <div key={entry.label}>
                    <button
                        onClick={() => toggleGroup(index)}
                        className={cn(
                            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            hasActiveChild
                                ? "text-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 text-left">{entry.label}</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                    </button>
                    {open && (
                        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
                            {entry.children.map((child) => {
                                const CIcon = child.icon;
                                const active = isActive(child.to);
                                const soon = COMING_SOON.has(child.to);
                                return (
                                    <Link
                                        key={child.to}
                                        to={child.to}
                                        onClick={() => setMobileOpen(false)}
                                        className={cn(
                                            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                                            active
                                                ? "bg-primary/10 font-medium text-primary"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                            soon && "pointer-events-none opacity-50",
                                        )}
                                    >
                                        <CIcon className="h-3.5 w-3.5" />
                                        {child.label}
                                        {soon && (
                                            <span className="ml-auto text-[10px] text-muted-foreground">Soon</span>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }
        const Icon = entry.icon;
        const active = isActive(entry.to);
        return (
            <Link
                key={entry.to}
                to={entry.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
            >
                <Icon className="h-4 w-4" />
                {entry.label}
            </Link>
        );
    };

    const navList = <nav className="flex flex-col gap-1 px-3 py-4">{NAV.map(renderItem)}</nav>;

    const brand = (
        <Link to="/admin" className="flex items-center gap-2.5 px-5 py-5">
            <HatIcon className="h-7 w-7 text-primary" />
            <div className="leading-tight">
                <div className="text-sm font-semibold text-foreground">Madd Hatter</div>
                <div className="text-[11px] text-muted-foreground">POS Sync</div>
            </div>
        </Link>
    );

    const footer = (
        <div className="mt-auto border-t border-border px-3 py-4">
            {email && (
                <div className="mb-2 truncate px-2 text-xs text-muted-foreground" title={email}>
                    {email}
                </div>
            )}
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={onLogout}>
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign out
            </Button>
        </div>
    );

    return (
        <div className="min-h-screen bg-muted/30">
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-background lg:flex">
                {brand}
                {navList}
                {footer}
            </aside>

            <div className="flex h-14 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
                <Link to="/admin" className="flex items-center gap-2">
                    <HatIcon className="h-6 w-6 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Madd Hatter POS</span>
                </Link>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open menu"
                >
                    <Menu className="h-5 w-5" />
                </Button>
            </div>

            {mobileOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
                    <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-background shadow-xl">
                        <div className="flex items-center justify-between">
                            {brand}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="mr-2"
                                onClick={() => setMobileOpen(false)}
                                aria-label="Close menu"
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                        {navList}
                        {footer}
                    </aside>
                </div>
            )}

            <div className="lg:pl-60">
                <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
            </div>
        </div>
    );
}
