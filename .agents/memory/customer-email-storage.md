---
name: Customer email storage
description: Why customer.email is plain text despite user.email being encrypted.
---

## Rule
`customers.email` is stored as plain `VARCHAR` (not encrypted).
`users.email` is stored encrypted via the `EncryptedString` SQLAlchemy TypeDecorator.

## Why
The customer list requires server-side ILIKE search across `email`. Searching encrypted columns is not feasible without decrypting all rows. Storing email plainly on the `customers` table enables `ILIKE '%query%'` at the DB level.

## How to apply
- When creating a customer, set both `customer.email = plaintext_email` AND `user.email = plaintext_email` (the TypeDecorator auto-encrypts the user field).
- When updating a customer's email, the service must update both records in the same transaction.
- `CustomerOut` reads `customer.email` for the display/login email field (not `customer.user.email`), keeping the serialisation simple.
