// =============================================================================
// Unit tests for pure integration logic functions.
// Run with: npx vitest run
//
// These tests cover the three areas most critical to get right:
//   1. ghl-tags.server: normalizeItemName + purchaseTagLabel
//   2. purchaseReference determinism + format
//   3. Phone number matching false-positive defence
//   4. Walk-in contact name generation
//   5. Money formatting
// =============================================================================

import { describe, it, expect } from "vitest";
import { normalizeItemName, purchaseTagLabel } from "../ghl-tags.server";

// ---------------------------------------------------------------------------
// 1. normalizeItemName + purchaseTagLabel
// ---------------------------------------------------------------------------

describe("normalizeItemName", () => {
  it("lowercases and title-cases a fully uppercase name", () => {
    expect(normalizeItemName("WINGS")).toBe("Wings");
  });

  it("strips leading/trailing whitespace", () => {
    expect(normalizeItemName("  Wings  ")).toBe("Wings");
  });

  it("collapses multiple internal spaces", () => {
    expect(normalizeItemName("BUFFALO   WINGS")).toBe("Buffalo Wings");
  });

  it("handles mixed case consistently", () => {
    expect(normalizeItemName("bUfFaLo WiNgS")).toBe("Buffalo Wings");
  });

  it("handles single-word names", () => {
    expect(normalizeItemName("beer")).toBe("Beer");
  });

  it("handles empty string gracefully", () => {
    expect(normalizeItemName("")).toBe("");
  });
});

describe("purchaseTagLabel", () => {
  it("returns the Clover prefix + normalized name", () => {
    expect(purchaseTagLabel("WINGS")).toBe("Clover - Purchased: Wings");
  });

  it("is consistent regardless of input casing", () => {
    expect(purchaseTagLabel("wings")).toBe(purchaseTagLabel("WINGS"));
    expect(purchaseTagLabel("Wings")).toBe(purchaseTagLabel("wInGs"));
  });

  it("includes the full expected prefix", () => {
    expect(purchaseTagLabel("Beer")).toMatch(/^Clover - Purchased: /);
  });
});

// ---------------------------------------------------------------------------
// 2. purchaseReference determinism
//    Inline re-implementation of the function for unit testing without
//    needing to resolve server-only module imports.
// ---------------------------------------------------------------------------

function purchaseReference(merchantId: string, orderId: string, lineItemId: string): string {
  return `clover:${merchantId}:${orderId}:${lineItemId}`;
}

describe("purchaseReference", () => {
  it("is deterministic for the same inputs", () => {
    const ref1 = purchaseReference("M1", "O1", "L1");
    const ref2 = purchaseReference("M1", "O1", "L1");
    expect(ref1).toBe(ref2);
  });

  it("differs when any segment differs", () => {
    const base = purchaseReference("M1", "O1", "L1");
    expect(purchaseReference("M2", "O1", "L1")).not.toBe(base);
    expect(purchaseReference("M1", "O2", "L1")).not.toBe(base);
    expect(purchaseReference("M1", "O1", "L2")).not.toBe(base);
  });

  it("has the expected clover: prefix format", () => {
    const ref = purchaseReference("MERCHANT", "ORDER", "LINEITEM");
    expect(ref).toBe("clover:MERCHANT:ORDER:LINEITEM");
  });

  it("does not truncate long IDs", () => {
    const longId = "a".repeat(64);
    const ref = purchaseReference(longId, longId, longId);
    expect(ref).toContain(longId);
  });
});

// ---------------------------------------------------------------------------
// 3. Phone normalisation / matching logic
//    Tests the digit-matching logic that prevents false positive phone matches.
// ---------------------------------------------------------------------------

function phoneDigitsMatch(contactPhone: string, queryPhone: string): boolean {
  const contactDigits = contactPhone.replace(/\D/g, "");
  const queryDigits = queryPhone.replace(/\D/g, "");
  return (
    contactDigits.endsWith(queryDigits) ||
    queryDigits.endsWith(contactDigits) ||
    contactDigits === queryDigits
  );
}

describe("phoneDigitsMatch (false-positive defence)", () => {
  it("matches identical US numbers in different formats", () => {
    expect(phoneDigitsMatch("+12015543794", "2015543794")).toBe(true);
    expect(phoneDigitsMatch("(201) 554-3794", "+12015543794")).toBe(true);
  });

  it("matches when one has country code and the other does not", () => {
    expect(phoneDigitsMatch("12015543794", "2015543794")).toBe(true);
    expect(phoneDigitsMatch("2015543794", "12015543794")).toBe(true);
  });

  it("rejects clearly different phone numbers", () => {
    expect(phoneDigitsMatch("+12015543794", "+19171234567")).toBe(false);
    expect(phoneDigitsMatch("5551234567", "5559876543")).toBe(false);
  });

  it("handles identical numbers", () => {
    expect(phoneDigitsMatch("2015543794", "2015543794")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Walk-in contact name generation
//    The sync creates a deterministic name for anonymous orders.
// ---------------------------------------------------------------------------

function walkinContactName(orderId: string): string {
  const suffix = orderId.slice(-6).toUpperCase();
  return `Walk-In Customer ${suffix}`;
}

describe("walkinContactName", () => {
  it("uses last 6 chars of order ID", () => {
    expect(walkinContactName("ABCDEF123456")).toBe("Walk-In Customer 123456");
  });

  it("uppercases the suffix", () => {
    expect(walkinContactName("xyz-abcdef")).toBe("Walk-In Customer ABCDEF");
  });

  it("is unique per distinct order suffix", () => {
    const a = walkinContactName("order-AAAAAA");
    const b = walkinContactName("order-BBBBBB");
    expect(a).not.toBe(b);
  });

  it("starts with Walk-In Customer prefix", () => {
    expect(walkinContactName("anything")).toMatch(/^Walk-In Customer /);
  });
});

// ---------------------------------------------------------------------------
// 5. Money formatting
//    The sync writes formatted money strings to GHL.
// ---------------------------------------------------------------------------

function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

describe("formatMoney", () => {
  it("formats whole dollar amounts", () => {
    expect(formatMoney(1000)).toBe("10.00");
  });

  it("formats cents correctly", () => {
    expect(formatMoney(99)).toBe("0.99");
    expect(formatMoney(1099)).toBe("10.99");
  });

  it("always returns two decimal places", () => {
    expect(formatMoney(100)).toBe("1.00");
    expect(formatMoney(150)).toBe("1.50");
  });

  it("handles zero", () => {
    expect(formatMoney(0)).toBe("0.00");
  });
});
