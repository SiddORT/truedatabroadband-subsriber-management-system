---
name: Multi-subscription per customer design
description: Each subscription owns its own connection_name + installation_address; duplicate address raises a soft warning; change_plan carries both fields forward.
---

# Multi-Subscription Per Customer Design

## Rule
A customer can have multiple ACTIVE subscriptions (one per physical location). Each subscription is the authoritative owner of its address.

## Fields on `subscriptions` table
- `connection_name` VARCHAR(100) nullable — human label ("Home", "Office", "Shop")
- `installation_address` TEXT nullable — full service address

## Address auto-fill
If `installation_address` is not supplied on create, it falls back to `customer.installation_address`.

## Duplicate address check
`SubscriptionService.create()` calls `SubscriptionRepository.find_active_at_address()` (case-insensitive strip comparison) and raises `DuplicateAddressWarning(existing_code)` if a match is found.

API returns **HTTP 409** with body `{"warning": "...", "existing_code": "TDB-SUB-XXXXX"}`.

Pass `?force=true` to skip the check and create anyway.

## Plan change
`change_plan()` carries `connection_name` + `installation_address` forward to the new subscription so the service location is preserved.

## PDF / invoice snapshots
`connection_name_snapshot` = `sub.connection_name or sub.subscription_code`
`installation_address_snapshot` = `sub.installation_address or customer.installation_address`

## Frontend
- SubscriptionCreatePage: Step 4 "Connection Details" — connection label + address (pre-filled from customer); 409 shows warning dialog with "Create Anyway" button that re-submits with `force=true`.
- SubscriptionDetailPage: "Connection Details" card shown when either field is set.
- CustomerDetailPage → Account tab: connection_name + installation_address shown under each active subscription card.
