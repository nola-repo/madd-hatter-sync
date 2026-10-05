import { useCallback, useEffect, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Loader2, Pencil, Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { adminMe } from "@/lib/integration/auth.functions";
import { getProfile, updateProfile } from "@/lib/integration/profile.functions";
import type { ProfileData } from "@/lib/integration/profile.functions";

const routeApi = getRouteApi("/_authenticated");

function formatMemberSince(iso: string | null): string {
  if (!iso) return "Recently";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "Recently";
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return "";
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, now - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? "" : "s"} ago`;
  } catch {
    return "";
  }
}

export function ProfilePage() {
  const ctx = routeApi.useRouteContext();
  const adminMeFn = useServerFn(adminMe);
  const getProfileFn = useServerFn(getProfile);
  const updateProfileFn = useServerFn(updateProfile);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProfileFn();
      if (res?.setupRequired) {
        setLoading(false);
        return;
      }
      const data = res as ProfileData;
      setProfile(data);
      setFullName(data.fullName ?? "");
      setNickname(data.nickname ?? "");
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [getProfileFn]);

  // Fallback: ensure we have an email even if getProfile fails (uses session).
  const [sessionEmail, setSessionEmail] = useState<string | null>(ctx.session?.email ?? null);
  useEffect(() => {
    if (sessionEmail) return;
    adminMeFn()
      .then((r) => {
        if (!r.setupRequired && r.session?.email) setSessionEmail(r.session.email);
      })
      .catch(() => {});
  }, [adminMeFn, sessionEmail]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const displayName =
    profile?.fullName?.trim() ||
    profile?.email?.split("@")[0] ||
    sessionEmail?.split("@")[0] ||
    "User";
  const email = profile?.email ?? sessionEmail ?? "";
  const initial = (displayName.trim().charAt(0) || "?").toUpperCase();

  function startEdit() {
    setFullName(profile?.fullName ?? "");
    setNickname(profile?.nickname ?? "");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setFullName(profile?.fullName ?? "");
    setNickname(profile?.nickname ?? "");
  }

  async function save() {
    setSaving(true);
    try {
      const res = await updateProfileFn({
        data: { fullName: fullName.trim(), nickname: nickname.trim() },
      });
      if (res?.setupRequired) {
        toast.error("Setup required. Add the missing secrets.");
        return;
      }
      if (!(res as { ok?: boolean }).ok) {
        toast.error((res as { error?: string }).error ?? "Failed to save profile.");
        return;
      }
      setProfile((prev) =>
        prev ? { ...prev, fullName: fullName.trim(), nickname: nickname.trim() } : prev,
      );
      setEditing(false);
      toast.success("Profile updated.");
      // Force a reload so the sidebar chip picks up the new name via context.
      window.location.reload();
    } catch {
      toast.error("Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Profile" description="Your account" />

      <Card className="overflow-hidden">
        {/* Banner */}
        <div
          className="h-24 w-full"
          style={{
            background:
              "linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)",
          }}
          aria-hidden
        />

        <CardContent className="px-6 pb-6">
          {/* Header row */}
          <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-card bg-primary/10 text-2xl font-semibold text-primary shadow-sm">
                {initial}
              </div>
              <div className="pb-1">
                <h2 className="text-lg font-bold text-foreground">{displayName}</h2>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={save}
                    disabled={saving}
                    id="profile-save"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={cancelEdit}
                    disabled={saving}
                    id="profile-cancel"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={startEdit}
                  id="profile-edit"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="mt-8 flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              {/* Form grid */}
              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-fullname">Full name</Label>
                  <Input
                    id="profile-fullname"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={!editing || saving}
                    readOnly={!editing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-nickname">Nickname</Label>
                  <Input
                    id="profile-nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    disabled={!editing || saving}
                    readOnly={!editing}
                    placeholder="Add a nickname"
                  />
                </div>
              </div>

              {/* Email address section */}
              <div className="mt-8 border-t border-border pt-6">
                <h3 className="text-sm font-semibold text-foreground">Email Address</h3>
                <div className="mt-3 flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{email || "—"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Member since {formatMemberSince(profile?.createdAt ?? null)}
                      {profile?.lastSignInAt
                        ? ` · Last sign in ${formatRelative(profile.lastSignInAt)}`
                        : ""}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
