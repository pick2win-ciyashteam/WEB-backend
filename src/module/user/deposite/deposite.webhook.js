// import Stripe from "stripe";
// import { addCoinsService } from "./deposite.service.js";

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// export const stripeWebhook = async (req, res) => {
//   const sig = req.headers["stripe-signature"];
//   let event;

//   try {
//     event = stripe.webhooks.constructEvent(
//       req.body,
//       sig,
//       process.env.STRIPE_WEBHOOK_SECRET
//     );
//   } catch (err) {
//     console.error("❌ Webhook signature failed:", err.message);
//     return res.status(400).send(`Webhook Error: ${err.message}`);
//   }

//   console.log("🔔 Event type:", event.type);

//   if (event.type !== "payment_intent.succeeded")
//     return res.json({ received: true });

//   const paymentIntent = event.data.object;
//   console.log("🔔 Metadata:", JSON.stringify(paymentIntent.metadata));

//   /* ── ✅ coins_purchase check ── */
//   if (paymentIntent.metadata?.type !== "coins_purchase") {
//     console.log("⚠️ Not a coins purchase:", paymentIntent.metadata?.type);
//     return res.json({ received: true });
//   }

//   const { userId, plan_id, coins } = paymentIntent.metadata;
//   const amount          = paymentIntent.amount / 100;
//   const paymentIntentId = paymentIntent.id;

//   if (!userId || !plan_id || !coins) {
//     console.error("❌ Missing metadata");
//     return res.json({ received: true });
//   }

//   try {
//     const result = await addCoinsService(
//       userId, plan_id, Number(coins), amount, paymentIntentId
//     );
//     console.log(`✅ Coins added — userId:${userId} coins:${coins} total:${result.totalCoins}`);
//     return res.json({ received: true });

//   } catch (err) {
//     if (err.message === "Payment already processed") {
//       console.log("⚠️ Duplicate ignored:", paymentIntentId);
//       return res.json({ received: true });
//     }
//     console.error(`❌ Coins update failed:`, err.message);
//     return res.status(500).json({ error: "Coins update failed" });
//   }
// };


import Stripe from "stripe";
import db from "../../../config/db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const stripeWebhook = async (req, res) => {
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

  console.log("🔔 Event type:", event.type);

  if (event.type !== "payment_intent.succeeded")
    return res.json({ received: true });

  const paymentIntent = event.data.object;
  console.log("🔔 Metadata:", JSON.stringify(paymentIntent.metadata));

  if (paymentIntent.metadata?.type !== "coins_purchase") {
    console.log("⚠️ Not a coins purchase:", paymentIntent.metadata?.type);
    return res.json({ received: true });
  }

  const { userId, plan_id, coins } = paymentIntent.metadata;
  const amount          = paymentIntent.amount / 100;
  const paymentIntentId = paymentIntent.id;

  if (!userId || !plan_id || !coins) {
    console.error("❌ Missing metadata");
    return res.json({ received: true });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    /* ── 1. Duplicate check ── */
    const [[existing]] = await conn.query(
      `SELECT id FROM coins_transactions WHERE reference_id = ? LIMIT 1`,
      [paymentIntentId]
    );
    if (existing) {
      console.log("⚠️ Duplicate ignored:", paymentIntentId);
      await conn.rollback();
      conn.release();
      return res.json({ received: true });
    }

    /* ── 2. Plan verify ── */
const [[plan]] = await conn.query(
  `SELECT id, coins, price, name, matches, validity_days FROM subscription_plans WHERE id = ? LIMIT 1`,
  [plan_id]
);
if (!plan) throw new Error("Plan not found");


    /* ── 3. Current wallet ── */
    const [[wallet]] = await conn.query(
      `SELECT coins, total_coins, available_coins FROM user_coins WHERE user_id = ? FOR UPDATE`,
      [userId]
    );

    const openingCoins = wallet ? Number(wallet.available_coins) : 0;
    const closingCoins = openingCoins + Number(coins);

    /* ── 4. Coins update or insert ── */
    if (wallet) {
      await conn.query(
        `UPDATE user_coins
         SET coins           = coins + ?,
             total_coins     = total_coins + ?,
             available_coins = available_coins + ?
         WHERE user_id = ?`,
        [coins, coins, coins, userId]
      );
    } else {
      await conn.query(
        `INSERT INTO user_coins (user_id, coins, total_coins, used_coins, available_coins)
         VALUES (?, ?, ?, 0, ?)`,
        [userId, coins, coins, coins]
      );
    }

    /* ── 5. Transaction log ── */
    await conn.query(
      `INSERT INTO coins_transactions
         (user_id, plan_id, coins, amount,
          opening_points, closing_points,
          reference_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success')`,
      [userId, plan_id, coins, amount, openingCoins, closingCoins, paymentIntentId]
    );

   
    /* ── 6. Subscription record ── */
await conn.query(
  `INSERT INTO user_subscriptions
     (user_id, plan_id, plan_name, coins, matches_allowed,
      amount, payment_reference, status, start_date, expiry_date)
   VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
  [userId, plan_id, plan.name, coins, plan.matches, amount, paymentIntentId, plan.validity_days]
);

    await conn.commit();

    console.log(`✅ Coins added — userId:${userId} coins:${coins} closing:${closingCoins}`);
    return res.json({ received: true });

  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error(`❌ Coins update failed:`, err.message);
    return res.status(500).json({ error: "Coins update failed" });
  } finally {
    conn.release();
  }
};