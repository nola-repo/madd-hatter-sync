import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, CreditCard, Cloud, KeyRound, ListChecks } from "lucide-react";

export function SetupGuide() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Setup Guide</h1>
                <p className="text-sm text-muted-foreground">
                    Follow these steps in order. Code is complete; only external accounts and secrets remain.
                </p>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <KeyRound className="h-4 w-4 text-primary" />
                        Required Secrets
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-3 text-sm text-muted-foreground">
                        Add each of these in the <strong>Secrets</strong> interface (never in code or chat).
                        Names must match exactly.
                    </p>
                    <div className="overflow-hidden rounded-md border border-border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-3 py-2">Secret name</th>
                                    <th className="px-3 py-2">What it is</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                <SecretRow
                                    name="SUPABASE_URL"
                                    desc="Your Supabase project URL (https://xxxx.supabase.co)"
                                />
                                <SecretRow
                                    name="SUPABASE_PUBLISHABLE_KEY"
                                    desc="Supabase publishable/public key (Project Settings → API) — browser auth"
                                />
                                <SecretRow
                                    name="SUPABASE_SECRET_KEY"
                                    desc="Supabase secret key (keep secret — server only)"
                                />
                                <SecretRow name="CLOVER_MERCHANT_ID" desc="Clover sandbox merchant ID (mId)" />
                                <SecretRow
                                    name="CLOVER_ACCESS_TOKEN"
                                    desc="Clover REST API key / access token (sandbox)"
                                />
                                <SecretRow name="GHL_LOCATION_ID" desc="CRM sub-account/location ID" />
                                <SecretRow name="GHL_PIT_TOKEN" desc="CRM Private Integration (PIT) bearer token" />
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Database className="h-4 w-4 text-primary" />1 · Supabase
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                        <li>
                            Create a project at <strong>supabase.com</strong> (free tier is fine).
                        </li>
                        <li>
                            Open <strong>SQL Editor</strong> → New query.
                        </li>
                        <li>
                            Paste the entire migration from <code>supabase/migrations/0001_init.sql</code> in this
                            project and click <strong>Run</strong>. This creates the{" "}
                            <code>customer_mappings</code>, <code>orders</code>, <code>order_items</code>, and{" "}
                            <code>sync_attempts</code> tables with unique constraints and RLS.
                        </li>
                        <li>
                            Go to <strong>Authentication → Users</strong> → <strong>Add user</strong>. Enter your
                            admin email and a strong password. This is your dashboard login.
                        </li>
                        <li>
                            Go to <strong>Project Settings → API</strong>. Copy the <strong>Project URL</strong>,{" "}
                            <strong>publishable</strong> key, and <strong>secret</strong> key.
                        </li>
                        <li>
                            Add them as secrets: <code>SUPABASE_URL</code>, <code>SUPABASE_PUBLISHABLE_KEY</code>,{" "}
                            <code>SUPABASE_SECRET_KEY</code>.
                        </li>
                    </ol>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <CreditCard className="h-4 w-4 text-primary" />2 · Clover (sandbox)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                        <li>
                            Sign up at <strong>docs.clover.com</strong> → Developer → Sandbox. Create a sandbox
                            merchant.
                        </li>
                        <li>
                            In the Clover Developer dashboard, create an <strong>REST API</strong> app and grant
                            it the <code>Read</code> scopes for Orders, Customers, Merchant, and Payments.
                        </li>
                        <li>
                            Install the app on your sandbox merchant and generate an <strong>access token</strong>
                            .
                        </li>
                        <li>
                            From the sandbox merchant dashboard, copy the <strong>merchant ID</strong> (mId).
                        </li>
                        <li>
                            Add secrets: <code>CLOVER_MERCHANT_ID</code> and <code>CLOVER_ACCESS_TOKEN</code>.
                        </li>
                        <li>
                            Create a test order with a customer attached and a paid line item, and copy its order
                            ID for testing.
                        </li>
                    </ol>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Cloud className="h-4 w-4 text-primary" />3 · CRM (GHL) sub-account
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                        <li>
                            In your CRM sub-account, go to{" "}
                            <strong>Settings → Developer → Private Integrations</strong> (or API → Private
                            Integration). Create one and copy the <strong>PIT token</strong>.
                        </li>
                        <li>
                            Copy the <strong>Location ID</strong> from the same settings page.
                        </li>
                        <li>
                            Add secrets: <code>GHL_LOCATION_ID</code> and <code>GHL_PIT_TOKEN</code>.
                        </li>
                        <li>
                            Go to <strong>Settings → Custom Objects</strong> and create a custom object named
                            exactly <strong>POS Purchase Item</strong>.
                        </li>
                        <li>
                            Add these fields (text unless noted): Purchase Reference, Item Name, Category,
                            Quantity (number), Unit Price (text/number), Line Total (text/number), Currency,
                            Purchase Date (date/text), Clover Order ID, Clover Line Item ID, Clover Item ID,
                            Clover Merchant ID, Clover Customer ID, Location Name, Payment Status.
                        </li>
                        <li>
                            Return to the dashboard and click <strong>Refresh</strong> — the schema card should
                            turn green.
                        </li>
                    </ol>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ListChecks className="h-4 w-4 text-primary" />
                        Testing scenarios
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                        <li>
                            <Badge variant="secondary">New customer</Badge> Create a Clover order with a customer
                            whose email/phone is not in CRM. Preview → should show “Create new contact”. Sync →
                            contact created, mapping saved.
                        </li>
                        <li>
                            <Badge variant="secondary">Existing customer</Badge> Use a Clover customer whose email
                            already matches a CRM contact. Preview → “Match existing contact”. Sync → reuses
                            contact, no duplicate.
                        </li>
                        <li>
                            <Badge variant="secondary">Repeated receipt</Badge> Sync the same order twice. The
                            second sync reuses the existing purchase records and association — no duplicates,
                            attempt count increments.
                        </li>
                        <li>
                            <Badge variant="secondary">Anonymous receipt</Badge> Create a Clover order with no
                            customer attached. Preview → “Anonymous purchase”. Sync is held; the order is
                            preserved as unmatched in Supabase. No placeholder CRM contact is created.
                        </li>
                        <li>
                            <Badge variant="secondary">Failed sync recovery</Badge> If a sync times out after a
                            partial CRM write, retry the same order. The sync reconciles existing records by
                            Purchase Reference before creating new ones.
                        </li>
                    </ul>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">What is implemented vs. awaiting config</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <ul className="space-y-1.5 text-muted-foreground">
                        <li>✅ Admin auth (Supabase), protected routes, connection checks</li>
                        <li>
                            ✅ Clover order + customer retrieval, line items, modifiers, discounts, payment status
                        </li>
                        <li>✅ Customer matching (mapping → email/phone → create; review on ambiguity)</li>
                        <li>✅ Idempotent purchase-record sync with concurrency lock + reconciliation</li>
                        <li>✅ Supabase migrations with unique constraints + RLS</li>
                        <li>⏳ Live data requires the 7 secrets above + the CRM custom object fields</li>
                        <li>
                            ⏳ Webhooks, scheduled syncs, production OAuth, historical imports — deferred to later
                            phases
                        </li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}

function SecretRow({ name, desc }: { name: string; desc: string }) {
    return (
        <tr>
            <td className="px-3 py-2">
                <code className="text-xs font-semibold text-foreground">{name}</code>
            </td>
            <td className="px-3 py-2 text-muted-foreground">{desc}</td>
        </tr>
    );
}
