# First paid business customer — implementation checklist

Stack: existing Firebase Authentication on Android; Firebase Admin and Firestore
on Next.js/Vercel; Stripe Checkout, subscriptions, webhooks and Billing Portal.

Business Starter: NZ$49/month. Provisional quota: 100 successful valuations
per billing period (verify provider economics before launch).

Firestore server-managed documents:
- businessCustomers/{firebaseUid}: stripeCustomerId, stripeSubscriptionId,
  subscriptionStatus, currentPeriodEnd, usageThisPeriod, periodStart, updatedAt
- billingEvents/{stripeEventId}: type, processedAt (deduplicate verified webhooks)
- valuationUsage/{firebaseUid}:{idempotencyKey}: uid, key, reserved/completed/failed

Required before enabling billing:
1. Verify Firebase ID tokens with Firebase Admin for paid routes.
2. Create Stripe Checkout sessions using the server-configured recurring price.
3. Verify webhook signatures over the raw request body; deduplicate and
   reconcile subscription state even when events arrive out of order.
4. Use Firestore transactions to reserve quota atomically and settle/release
   exactly once. Same idempotency key must never run valuation twice.
5. Charge allowance only for successful grounded/accepted heuristic results;
   failed and unpriced outcomes must not consume quota.
6. Implement Billing Portal and cancellation/renewal handling.
7. Update Android to send Firebase bearer tokens and idempotency keys.
8. Test signup, test checkout, activation, concurrency, retries, webhook
   replay, cancellations and valuation failures before any live billing.

Safety:
- BUSINESS_BILLING_ENABLED=false until implementation and tests are complete.
- Never place Admin/Stripe secrets in the APK or public environment variables.
- firestore.rules is a billing-only draft: merge with existing Firebase rules,
  do not overwrite other production collection rules.
- Keep the existing seven-stage valuation engine unchanged.

Status: **Foundation only**. Payment endpoints, auth verification, Firestore
transactions and Android wiring are not yet implemented.
