---
name: Dashboard invoice ownership filter
description: How to correctly scope invoice queries to a single customer in the client dashboard
---

## The Rule
Invoices can belong to a customer in two ways:
1. **SINGLE invoices**: `invoice.subscription_id` → subscription → `customer_id`
2. **CONSOLIDATED invoices**: `invoice.customer_id` directly

Always use an OR filter:
```python
sub_ids = db.query(Subscription.id).filter(
    Subscription.customer_id == customer.id,
    Subscription.deleted_at.is_(None),
)
filter = or_(
    Invoice.customer_id == customer.id,
    Invoice.subscription_id.in_(sub_ids),
)
```

**Why:** A CONSOLIDATED invoice has `subscription_id=NULL` and uses `customer_id` directly. Filtering only by subscription_id misses those. Filtering only by `customer_id` misses SINGLE invoices (which have `customer_id=NULL`).

**How to apply:** Use `_invoice_ownership_filter(customer, db)` helper in `backend/app/api/v1/client.py` for any client-facing invoice query.
