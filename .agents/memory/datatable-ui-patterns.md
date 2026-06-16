---
name: DataTable & UI patterns
description: DataTable component API, accent color usage rules, list page structure conventions.
---

## DataTable component (`src/components/DataTable.tsx`)

**New props (Phase 5+ pattern):**
- `filtersNode?: React.ReactNode` — rendered in a collapsible panel below the search bar; toggled by a "Filters" button in the toolbar.
- `filterCount?: number` — drives the red badge on the Filters button; pass the count of active filter values.

**Layout (top → bottom):**
1. Search bar (flex-1) + Filters button (only if filtersNode provided)
2. Collapsible filter panel (`bg-muted/30`, `border-b`)
3. `<Table>` (no extra wrapper — card provides border/shadow)
4. Footer: `X–Y of Total` | `Rows per page <select>` | Prev/pages/Next

**Why:** The old layout had search + rows-per-page on the same row as the count, with status filters in a separate CardHeader — fragmented and messy.

## List page structure (all admin list pages)

```jsx
<Card>
  <CardContent className="p-0">
    <DataTable
      ...
      filtersNode={<select value={statusFilter} onChange={...} .../>}
      filterCount={statusFilter ? 1 : 0}
    />
  </CardContent>
</Card>
```

**No CardHeader** — count is shown in the DataTable footer ("X–Y of Total"). Filters live inside DataTable via `filtersNode`.

## Invoice line items & discount (Phase 5+)

DB columns on `invoices` (migration `0011`): `line_items` (JSONB), `line_items_total`, `discount_type` (`percentage`/`fixed`), `discount_value`, `discount_amount`, `discount_label`.

Calculation order:
1. `discount_amount = base × value/100` (percentage) or `min(value, base)` (fixed)
2. `effective_base = base − discount_amount`
3. `gst_amount = effective_base × gst_pct / 100`
4. `line_items_total = sum(item.amount for item in line_items where amount > 0)`
5. `total = effective_base + gst_amount + line_items_total`

`InvoiceCreate` schema accepts `line_items: list[LineItemIn]`, `discount_type`, `discount_value`, `discount_label`. Backend filters zero-amount items before storing.

Frontend UI (Step 4): dedicated "Installation Charges" + "Service Charges" fields always visible; custom rows added dynamically; discount type toggle (None / % / ₹). Summary panel shows live breakdown.

## Accent red (`#D72B20` = `text-accent` / `bg-accent`)

Use accent (NOT primary) for decorative form UI indicators:
- `WizardProgress` step circles: completed = `bg-accent text-white`, active = `bg-accent/10 text-accent ring-2 ring-accent`, connector lines = `bg-accent`
- `SectionTitle` icon container: `bg-accent/10`, icon: `text-accent`
- Step icon header (card sub-header in CustomerCreatePage/EditPage): `bg-accent/10`, icon: `text-accent`
- `StepBadge` (SubscriptionCreatePage, InvoiceCreatePage): active = `bg-accent text-white`, done = `bg-green-500 text-white`
- `SummaryRow` highlight value: `text-accent`

**Why:** Primary (#1F4959) is for interactive elements (buttons, links, focus rings). Accent (#D72B20) is the brand red that enriches visual hierarchy in forms without competing with the action color.
