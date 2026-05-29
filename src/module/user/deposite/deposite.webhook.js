import Stripe from "stripe";
import { addPointsService } from "./deposite.service.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= STRIPE WEBHOOK ================= */
export const stripeWebhook = async (req, res) => {

  // ── Signature verify ──
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== "payment_intent.succeeded")
    return res.json({ received: true });

  const paymentIntent = event.data.object;

  console.log("🔔 metadata:", JSON.stringify(paymentIntent.metadata));

  if (paymentIntent.metadata?.type !== "points_purchase")
    return res.json({ received: true });

  const { userId, plan_id, coins } = paymentIntent.metadata;
  const amount          = paymentIntent.amount / 100;
  const paymentIntentId = paymentIntent.id;

  if (!userId || !plan_id || !coins) {
    console.error("❌ Missing metadata for:", paymentIntentId);
    return res.json({ received: true });
  }

  try {
    await addPointsService(userId, plan_id, Number(coins), amount, paymentIntentId);
    console.log(`✅ Points added — userId:${userId} coins:${coins} pi:${paymentIntentId}`);
    return res.json({ received: true });

  } catch (err) {
    if (err.message === "Payment already processed") {
      console.log("⚠️ Duplicate webhook ignored:", paymentIntentId);
      return res.json({ received: true });
    }
    console.error(`❌ Points update failed — userId:${userId} pi:${paymentIntentId}`, err.message);
    return res.status(500).json({ error: "Points update failed, will retry" });
  }
};