---
name: Subscription code generation
description: generate_next_code must filter to numeric codes before taking max — func.max() on VARCHAR is lexicographic and breaks with non-standard codes.
---

# Subscription Code Generation

## Rule
`generate_next_code()` in `SubscriptionRepository` must filter to codes matching `^TDB-SUB-\d+$` before computing the max.

## Why
`func.max()` on a VARCHAR column uses lexicographic ordering. If any non-numeric test code exists (e.g. `TDB-SUB-T94D4`), it sorts higher than `TDB-SUB-00001` and `int("T94D4")` raises `ValueError`, causing the fallback to reset to n=1 and collide with the existing code → `UniqueViolation`.

## How to apply
```python
rows = self.db.execute(
    select(Subscription.subscription_code)
    .where(Subscription.subscription_code.regexp_match(r"^TDB-SUB-\d+$"))
).scalars().all()
nums = [int(c.split("-")[-1]) for c in rows if c.split("-")[-1].isdigit()]
n = (max(nums) if nums else 0) + 1
return f"TDB-SUB-{n:05d}"
```
