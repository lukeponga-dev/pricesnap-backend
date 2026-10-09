import { authenticatedUid, billingDb } from "../../../../lib/billing/firebase";
import { appOrigin, stripeClient } from "../../../../lib/billing/stripe";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const uid = await authenticatedUid(request);
  if (!uid) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (process.env.BUSINESS_BILLING_ENABLED !== "true") {
    return Response.json({ error: "Billing not enabled" }, { status: 503 });
  }
  const price = process.env.STRIPE_BUSINESS_STARTER_PRICE_ID;
  if (!price) return Response.json({ error: "Billing not configured" }, { status: 503 });
  try {
    const db = billingDb();
    const customerRef = db.collection("businessCustomers").doc(uid);
    const record = (await customerRef.get()).data();
    const stripe = stripeClient();
    let customerId = record?.stripeCustomerId as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { firebaseUid: uid } });
      customerId = customer.id;
      await customerRef.set({ stripeCustomerId: customerId, updatedAt: new Date().toISOString() }, { merge: true });
    }
    const origin = appOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: uid,
      subscription_data: { metadata: { firebaseUid: uid } },
      success_url: origin + "/billing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: origin + "/billing/cancel",
    });
    return Response.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to start checkout" }, { status: 502 });
  }
}
