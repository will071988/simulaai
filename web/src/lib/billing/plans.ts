import { z } from "zod";

export const BillingPlanCodeSchema = z.enum(["premium_monthly", "premium_annual", "premium_one_time"]);
export type BillingPlanCode = z.infer<typeof BillingPlanCodeSchema>;

type BillingPlan = {
  code: BillingPlanCode;
  mode: "subscription" | "payment";
  priceId: string;
};

export function billingPlan(code: BillingPlanCode): BillingPlan | null {
  const prices: Record<BillingPlanCode, BillingPlan> = {
    premium_monthly: {
      code: "premium_monthly",
      mode: "subscription",
      priceId: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || "",
    },
    premium_annual: {
      code: "premium_annual",
      mode: "subscription",
      priceId: process.env.STRIPE_PRICE_PREMIUM_ANNUAL || "",
    },
    premium_one_time: {
      code: "premium_one_time",
      mode: "payment",
      priceId: process.env.STRIPE_PRICE_PREMIUM_ONE_TIME || "",
    },
  };
  return prices[code].priceId ? prices[code] : null;
}

export function billingConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_PRICE_PREMIUM_MONTHLY &&
    process.env.STRIPE_PRICE_PREMIUM_ANNUAL &&
    process.env.STRIPE_PRICE_PREMIUM_ONE_TIME
  );
}
