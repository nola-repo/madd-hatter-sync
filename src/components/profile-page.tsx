import { useCallback, useEffect, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { adminMe } from "@/lib/integration/auth.functions";

const routeApi = getRouteApi("/_authenticated");

export function ProfilePage() {
  const ctx = routeApi.useRouteContext();
  const adminMeFn = useServerFn(adminMe);

  const [email, setEmail] = useState<string | null>(ctx.session?.email ?? null);

  const loadEmail = useCallback(async () => {
    if (email) return;
    try {
      const res = await adminMeFn();
      if (!res.setupRequired && res.session?.email) setEmail(res.session.email);
    } catch {
      /* ignore */
    }
  }, [adminMeFn, email]);

  useEffect(() => {
    loadEmail();
  }, [loadEmail]);

  const initial = (email ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div>
      <PageHeader title="Profile" description="Your account" />

      <Card className="mb-4">
        <CardContent className="flex items-center gap-3 pt-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{email ?? "Signed in user"}</div>
            <div className="truncate text-xs text-muted-foreground">{email ?? ""}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
