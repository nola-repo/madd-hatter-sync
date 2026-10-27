# GHL POS Purchase Item — Required Custom Object Fields

> **Object Key:** `custom_objects.pos_purchase_item`
> **Default Schema ID:** `6aad9f812c282b1dfcb1c1b8`
>
> If the GHL custom object is deleted or recreated, use this document to
> rebuild it exactly. All 15 fields below must exist in the GHL custom object
> for the sync to function fully. The `Purchase Reference` field is the only
> **hard requirement** (used for idempotent deduplication). All others are
> logged as warnings if missing.

## Required Fields (15 total)

| Field Label             | Type        | Notes                                                                                                              |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| **Purchase Reference**  | Text        | ⚠️ **Critical.** Deterministic ID: `clover:{merchantId}:{orderId}:{lineItemId}`. Used to detect duplicate records. |
| **Item Name**           | Text        | The Clover inventory item name, e.g. "Wings"                                                                       |
| **Category**            | Text        | Clover item category name                                                                                          |
| **Quantity**            | Number      | Integer quantity sold                                                                                              |
| **Unit Price**          | Text        | Formatted as `"10.99"` (dollars.cents)                                                                             |
| **Line Total**          | Text        | Formatted as `"21.98"` (quantity × unit price − discount)                                                          |
| **Currency**            | Text        | ISO 4217 code, e.g. `"USD"`                                                                                        |
| **Purchase Date**       | Date / Text | ISO 8601 string, e.g. `"2026-09-29T12:00:00.000Z"`                                                                 |
| **Clover Order ID**     | Text        | Raw Clover order ID                                                                                                |
| **Clover Line Item ID** | Text        | Raw Clover line item ID                                                                                            |
| **Clover Item ID**      | Text        | Clover inventory item ID (may be empty for custom items)                                                           |
| **Clover Merchant ID**  | Text        | The merchant ID this order belongs to                                                                              |
| **Clover Customer ID**  | Text        | Clover customer ID (empty for anonymous walk-ins)                                                                  |
| **Location Name**       | Text        | Clover merchant/device location label                                                                              |
| **Payment Status**      | Text        | One of: `PAID`, `PARTIALLY_PAID`, `PENDING`, `REFUNDED`, `VOIDED`, `UNKNOWN`                                       |

## Rebuilding the Object in GHL

1. Go to **GHL → Settings → Custom Objects**
2. Create a new object named `POS Purchase Item` (key: `pos_purchase_item`)
3. Add all 15 fields above with the matching labels and types
4. Copy the new object's ID from the URL or settings
5. Update your `GHL_PURCHASE_OBJECT_SCHEMA_KEY` env var with the new ID
6. Redeploy / restart the app so the new ID is picked up

## Verification

After rebuilding, call:

```
GET /api/health?secret=<SYNC_SECRET>
```

The `ghl_schema_id_valid` check will confirm whether the env var matches the
object GHL actually returns.
