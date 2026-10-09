import "server-only";
import Stripe from "stripe";

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe not configured");
  return new Stripe(key);
}

export function appOrigin(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) throw new Error("APP_BASE_URL not configured");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("APP_BASE_URL must use HTTPS");
  }
  return parsed.origin;
}
