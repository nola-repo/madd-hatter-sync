//
// Server-only Clover date-range helpers.
// ONE canonical conversion: human range label -> Clover createdTime ms bounds.
// Used by BOTH the ingestion layer (Clover API filter) AND the dashboard
// aggregation (Supabase created_time filter) so the two always stay in sync.
//
// Timezone: Clover createdTime is epoch milliseconds (UTC-absolute). The
// "start of day/week/month" boundary is computed in the merchant's local
// timezone so "Today" matches what the Clover dashboard shows for the
// merchant. The merchant timezone defaults to America/New_York (Madd Hatter
// Hoboken/NOLA) and can be overridden via CLOVER_TIMEZONE.

export type RangeLabel = "today" | "week" | "month" | "3d" | "7d" | "30d" | "all";

export type DateRange = {
    startMs: number; // inclusive lower bound (Clover createdTime >= startMs)
    endMs: number; // inclusive upper bound (Clover createdTime <= endMs)
    label: RangeLabel;
};

/**
 * Resolve the merchant timezone. Read lazily (not at module scope) so it
 * picks up the env value at call time inside a server boundary.
 */
function merchantTimezone(): string {
    return process.env.CLOVER_TIMEZONE ?? "America/New_York";
}

/**
 * Get "now" as a Date, but interpreted in the merchant's timezone. We use
 * Intl to find the timezone offset so the local day/week/month boundaries
 * align with what the merchant sees in the Clover dashboard.
 */
function nowInMerchantTz(): Date {
    const tz = merchantTimezone();
    const now = new Date();
    // Compute the wall-clock time in the merchant timezone as a UTC Date so
    // that startOfDay/week/month math uses merchant-local boundaries.
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
    const y = Number(get("year"));
    const mo = Number(get("month")) - 1;
    const d = Number(get("day"));
    const h = Number(get("hour")) % 24; // hour24 can be "24" at midnight
    const mi = Number(get("minute"));
    const s = Number(get("second"));
    // This Date is the merchant-local wall time expressed as UTC; we use it
    // only for boundary arithmetic, then convert back below.
    return new Date(Date.UTC(y, mo, d, h, mi, s));
}

/**
 * Convert a merchant-local wall-clock Date into the true UTC ms epoch that
 * Clover uses for createdTime. We do this by taking the merchant-local
// boundary and applying the timezone offset.
 */
function merchantLocalToUtc(localWall: Date): number {
    const tz = merchantTimezone();
    // The wall time components in merchant TZ:
    const y = localWall.getUTCFullYear();
    const mo = localWall.getUTCMonth();
    const d = localWall.getUTCDate();
    const h = localWall.getUTCHours();
    const mi = localWall.getUTCMinutes();
    const s = localWall.getUTCSeconds();
    const wallStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    // Interpret this wall time as being in the merchant timezone → UTC epoch.
    const utcMs = Date.parse(wallStr); // parsed as UTC
    // Now find the offset of the merchant TZ at that instant and subtract it
    // so we get the true UTC epoch for the merchant-local wall time.
    const offsetMin = tzOffsetMinutes(tz, utcMs);
    return utcMs - offsetMin * 60_000;
}

/** Get the timezone offset (minutes) for a TZ at a given UTC instant. */
function tzOffsetMinutes(tz: string, utcMs: number): number {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
    });
    const parts = dtf.formatToParts(new Date(utcMs));
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    // shortOffset looks like "GMT-4" or "GMT+5:30"
    const m = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!m) return 0;
    const sign = m[1] === "-" ? -1 : 1;
    const hh = Number(m[2]);
    const mm = m[3] ? Number(m[3]) : 0;
    return sign * (hh * 60 + mm);
}

export function rangeToMs(label: RangeLabel): DateRange {
    const nowWall = nowInMerchantTz(); // merchant-local wall time as UTC components
    const endMs = Date.now(); // true now in UTC epoch

    if (label === "today") {
        const sodWall = new Date(
            Date.UTC(nowWall.getUTCFullYear(), nowWall.getUTCMonth(), nowWall.getUTCDate(), 0, 0, 0),
        );
        return { startMs: merchantLocalToUtc(sodWall), endMs, label };
    }
    if (label === "week") {
        // Start of week (Sunday-based, matching Clover dashboard default).
        const day = nowWall.getUTCDay(); // 0=Sun
        const sowWall = new Date(
            Date.UTC(
                nowWall.getUTCFullYear(),
                nowWall.getUTCMonth(),
                nowWall.getUTCDate() - day,
                0,
                0,
                0,
            ),
        );
        return { startMs: merchantLocalToUtc(sowWall), endMs, label };
    }
    if (label === "month") {
        const somWall = new Date(Date.UTC(nowWall.getUTCFullYear(), nowWall.getUTCMonth(), 1, 0, 0, 0));
        return { startMs: merchantLocalToUtc(somWall), endMs, label };
    }
    if (label === "3d") {
        const s = new Date(
            Date.UTC(nowWall.getUTCFullYear(), nowWall.getUTCMonth(), nowWall.getUTCDate() - 2, 0, 0, 0),
        );
        return { startMs: merchantLocalToUtc(s), endMs, label };
    }
    if (label === "7d") {
        const s = new Date(
            Date.UTC(nowWall.getUTCFullYear(), nowWall.getUTCMonth(), nowWall.getUTCDate() - 6, 0, 0, 0),
        );
        return { startMs: merchantLocalToUtc(s), endMs, label };
    }
    if (label === "30d") {
        const s = new Date(
            Date.UTC(nowWall.getUTCFullYear(), nowWall.getUTCMonth(), nowWall.getUTCDate() - 29, 0, 0, 0),
        );
        return { startMs: merchantLocalToUtc(s), endMs, label };
    }
    // "all" — no lower bound; use epoch 0.
    return { startMs: 0, endMs, label };
}

/**
 * Build the Clover REST API filter query string for createdTime.
 * Clover filter syntax: filter=createdTime>=123&filter=createdTime<=456
 */
export function cloverDateFilter(range: DateRange): string {
    const parts: string[] = [];
    if (range.startMs > 0) parts.push(`filter=createdTime>=${range.startMs}`);
    if (range.endMs > 0) parts.push(`filter=createdTime<=${range.endMs}`);
    return parts.length ? `&${parts.join("&")}` : "";
}

/**
 * Parse an ISO startDate/endDate pair (from the refresh endpoint) into a
 * DateRange. Falls back to "all" when neither is provided.
 */
export function isoToRange(startDate?: string, endDate?: string): DateRange {
    const startMs = startDate ? new Date(startDate).getTime() : 0;
    const endMs = endDate ? new Date(endDate).getTime() : Date.now();
    return { startMs, endMs, label: "all" };
}
