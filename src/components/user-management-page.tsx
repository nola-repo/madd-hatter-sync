import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Trash2, Loader2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import {
  listManagedUsers,
  setUserApproval,
  removeManagedUser,
} from "@/lib/integration/user-management.functions";
import type { ManagedUser } from "@/lib/integration/user-management.functions";
import { isSuperAdminEmail } from "@/lib/integration/super-admin";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function UserManagementPage() {
  const listFn = useServerFn(listManagedUsers);
  const approveFn = useServerFn(setUserApproval);
  const removeFn = useServerFn(removeManagedUser);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listFn();
      if (res?.setupRequired) {
        setLoading(false);
        return;
      }
      setUsers((res as { users: ManagedUser[] }).users ?? []);
    } catch {
      toast.error("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleApproval(u: ManagedUser) {
    setBusyId(u.userId);
    try {
      const res = await approveFn({ data: { userId: u.userId, approved: !u.approved } });
      if (res?.setupRequired) {
        toast.error("Setup required.");
        return;
      }
      if (!(res as { ok?: boolean }).ok) {
        toast.error((res as { error?: string }).error ?? "Failed to update.");
        return;
      }
      if (!u.approved) {
        const sent = (res as { emailSent?: string }).emailSent;
        if (sent === "sent") toast.success("Access granted. Approval email sent.");
        else if (sent === "failed") toast.success("Access granted. Approval email failed to send.");
        else toast.success("Access granted.");
      } else {
        toast.success("Access revoked.");
      }
      setUsers((prev) =>
        prev.map((p) => (p.userId === u.userId ? { ...p, approved: !p.approved } : p)),
      );
    } catch {
      toast.error("Failed to update.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(u: ManagedUser) {
    if (!confirm(`Remove ${u.email} from the admin allowlist? They will lose dashboard access.`)) {
      return;
    }
    setBusyId(u.userId);
    try {
      const res = await removeFn({ data: { userId: u.userId } });
      if (res?.setupRequired) {
        toast.error("Setup required.");
        return;
      }
      if (!(res as { ok?: boolean }).ok) {
        toast.error((res as { error?: string }).error ?? "Failed to remove.");
        return;
      }
      toast.success("User removed.");
      setUsers((prev) => prev.filter((p) => p.userId !== u.userId));
    } catch {
      toast.error("Failed to remove.");
    } finally {
      setBusyId(null);
    }
  }

  const approvedCount = users.filter((u) => u.approved).length;

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Approve, revoke, and remove admin access to the dashboard."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{users.length}</div>
              <div className="text-xs text-muted-foreground">Total users</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{approvedCount}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="flex items-center gap-3 pt-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <ShieldOff className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">
                {users.length - approvedCount}
              </div>
              <div className="text-xs text-muted-foreground">Pending / revoked</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin Users</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading users…
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">User</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Member since</th>
                    <th className="pb-2 pr-4 font-medium">Last sign in</th>
                    <th className="pb-2 pr-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const superAdmin = isSuperAdminEmail(u.email);
                    const busy = busyId === u.userId;
                    return (
                      <tr key={u.userId} className="border-b border-border/60 align-middle">
                        <td className="py-3 pr-4">
                          <div className="font-medium text-foreground">
                            {u.fullName || u.email.split("@")[0]}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </td>
                        <td className="py-3 pr-4">
                          {superAdmin ? (
                            <Badge>Super Admin</Badge>
                          ) : u.approved ? (
                            <Badge className="bg-primary/10 text-primary">Approved</Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {formatDate(u.lastSignInAt)}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {superAdmin ? (
                            <span className="text-xs text-muted-foreground">Protected</span>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant={u.approved ? "outline" : "default"}
                                onClick={() => toggleApproval(u)}
                                disabled={busy}
                              >
                                {busy ? (
                                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                ) : u.approved ? (
                                  <ShieldOff className="mr-2 h-3.5 w-3.5" />
                                ) : (
                                  <ShieldCheck className="mr-2 h-3.5 w-3.5" />
                                )}
                                {u.approved ? "Revoke" : "Approve"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeUser(u)}
                                disabled={busy}
                                aria-label={`Remove ${u.email}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
