// Browser-safe super-admin identity. This is an access-control hint only —
// every privileged server function re-checks the signed-in session email
// before acting, so changing this constant on the client grants nothing.

export const SUPER_ADMIN_EMAIL = "monzydave13@gmail.com";

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}
