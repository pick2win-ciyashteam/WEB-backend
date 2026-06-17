import Stripe from "stripe";
import db from "../../../config/db.js";
import { sendBillingMail, coinPurchaseEmailHtml } from "../../../utils/mailer.js";




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
      `SELECT id, coins, price, name, matches, validity_days
       FROM subscription_plans WHERE id = ? LIMIT 1`,
      [plan_id]
    );
    if (!plan) throw new Error("Plan not found");

    /* ── 3. Current wallet ── */
    const [[wallet]] = await conn.query(
      `SELECT coins, total_coins, available_coins
       FROM user_coins WHERE user_id = ? FOR UPDATE`,
      [userId]
    );

    /* ── 4. User fetch ── */
    const [[userInfo]] = await conn.query(
      `SELECT fullname, email, mobile FROM users WHERE id = ?`,
      [userId]
    );

    const openingCoins = wallet ? Number(wallet.available_coins) : 0;
    const closingCoins = openingCoins + Number(coins);

    /* ── 5. Coins update or insert ── */
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
        `INSERT INTO user_coins
           (user_id, coins, total_coins, used_coins, available_coins)
         VALUES (?, ?, ?, 0, ?)`,
        [userId, coins, coins, coins]
      );
    }

    /* ── 6. Coins transaction log ── */
    const [txResult] = await conn.query(
      `INSERT INTO coins_transactions
         (user_id, plan_id, coins, amount,
          opening_points, closing_points,
          reference_id, status,
          user_name, user_email, user_mobile)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?)`,
      [
        userId, plan_id, coins, amount,
        openingCoins, closingCoins,
        paymentIntentId,
        userInfo?.fullname || null,
        userInfo?.email    || null,
        userInfo?.mobile   || null,
      ]
    );

    /* ── 7. Subscription record ── */
    await conn.query(
      `INSERT INTO user_subscriptions
         (user_id, plan_id, plan_name, coins, matches_allowed,
          amount, payment_reference, status, start_date, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [
        userId, plan_id, plan.name, coins,
        plan.matches, amount, paymentIntentId,
        plan.validity_days,
      ]
    );

    /* ── 8. Company ledger ── */
    const [[lastEntry]] = await conn.query(
      `SELECT closing_balance FROM company_ledger ORDER BY id DESC LIMIT 1`
    );

    const companyOpening = lastEntry ? Number(lastEntry.closing_balance) : 0;
    const companyClosing = companyOpening + Number(amount);

    await conn.query(
      `INSERT INTO company_ledger
         (transaction_id, user_id, user_name, user_email,
          plan_name, amount, opening_balance, closing_balance,
          payment_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txResult.insertId,
        userId,
        userInfo?.fullname || null,
        userInfo?.email    || null,
        plan.name,
        amount,
        companyOpening,
        companyClosing,
        paymentIntentId,
      ]
    );

    await conn.commit();

    /* ── Send purchase confirmation email ── */
try {
  await sendBillingMail({
    to:      userInfo?.email,
    subject: `Coin Purchase Successful · ${plan.name}`,
    html:    coinPurchaseEmailHtml({
      fullname:      userInfo?.fullname || "User",
      planName:      plan.name,
      coins:         coins,
      currentBalance: closingCoins,
      currency:      "£",
      amount:        amount,
      transactionId: paymentIntentId,
      purchaseDate:  new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric"
      }),
    }),
  });
  console.log(`✅ Purchase email sent to ${userInfo?.email}`);
} catch (mailErr) {
  console.warn(`⚠️ Purchase email failed: ${mailErr.message}`);
}

    console.log(`✅ Coins added    — userId:${userId} coins:${coins} closing:${closingCoins}`);
    console.log(`✅ Ledger updated — opening:${companyOpening} closing:${companyClosing}`);
    return res.json({ received: true });

  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error(`❌ Webhook failed:`, err.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  } finally {
    conn.release();
  }
};  