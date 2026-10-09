import { billingDb } from "../../../../lib/billing/firebase";
import { stripeClient } from "../../../../lib/billing/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

function subscriptionFromEvent(event: Stripe.Event): string | null {
  const object = event.data.object as unknown as { id?: string; subscription?: string | { id: string } };
  if (event.type.startsWith("customer.subscription.")) return object.id ?? null;
  if (event.type === "checkout.session.completed") {
    return typeof object.subscription === "string" ? object.subscription : object.subscription?.id ?? null;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return Response.json({ error: "Missing webhook signature" }, { status: 400 });
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return Response.json({ error: "Invalid webhook signature" }, { status: 400 });
  }
  const subscriptionId = subscriptionFromEvent(event);
  if (!subscriptionId) return Response.json({ received: true });
  try {
    // Fetch current Stripe state to avoid applying stale, out-of-order event snapshots.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const uid = subscription.metadata.firebaseUid;
    if (!uid) return Response.json({ error: "Unlinked subscription" }, { status: 422 });
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const db = billingDb();
    const customerRef = db.collection("businessCustomers").doc(uid);
    const eventRef = db.collection("billingEvents").doc(event.id);
    await db.runTransaction(async transaction => {
      if ((await transaction.get(eventRef)).exists) return;
      const customer = await transaction.get(customerRef);
      const existing = customer.data();
      if (existing?.stripeCustomerId && existing.stripeCustomerId !== customerId) {
        throw new Error("Customer ownership mismatch");
      }
      // Subscription item period boundaries are authoritative in recent Stripe API versions.
      const periodEnd = subscription.items.data.reduce((max, item) => Math.max(max, item.current_period_end), 0);
      const periodStart = subscription.items.data.reduce((min, item) => Math.min(min, item.current_period_start), Number.MAX_SAFE_INTEGER);
      const nextPeriod = periodStart === Number.MAX_SAFE_INTEGER ? null : new Date(periodStart * 1000).toISOString();
      const resetUsage = existing?.periodStart !== nextPeriod;
      transaction.set(customerRef, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        periodStart: nextPeriod,
        usageThisPeriod: resetUsage ? 0 : (existing?.usageThisPeriod ?? 0),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      transaction.create(eventRef, { type: event.type, processedAt: new Date().toISOString() });
    });
    return Response.json({ received: true });
  } catch {
    // Non-2xx tells Stripe to retry; do not acknowledge a failed database write.
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
