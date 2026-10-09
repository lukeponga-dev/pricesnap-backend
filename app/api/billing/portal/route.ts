import { authenticatedUid, billingDb } from "../../../../lib/billing/firebase";
import { appOrigin, stripeClient } from "../../../../lib/billing/stripe";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const uid = await authenticatedUid(request);
  if (!uid) return Response.json({ error: "Authentication required" }, { status: 401 });
  if (process.env.BUSINESS_BILLING_ENABLED !== "true") {
    return Response.json({ error: "Billing not enabled" }, { status: 503 });
  }
  try {
    const customer = (await billingDb().collection("businessCustomers").doc(uid).get()).data();
    if (typeof customer?.stripeCustomerId !== "string") {
      return Response.json({ error: "No billing customer" }, { status: 404 });
    }
    const session = await stripeClient().billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: appOrigin() + "/",
    });
    return Response.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to open billing portal" }, { status: 502 });
  }
}
