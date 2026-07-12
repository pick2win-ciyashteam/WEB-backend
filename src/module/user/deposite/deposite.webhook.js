import crypto from "crypto";
import db      from "../../../config/db.js";
import { sendBillingMail, coinPurchaseEmailHtml } from "../../../utils/mailer.js";
import { sendPushToUser } from "../../../utils/notification.js";

/* ── Razorpay signs the exact raw request bytes, so this route is mounted
   with express.raw() (see app.js) instead of express.json() — req.body is
   a Buffer here. HMAC-verifying that raw buffer (rather than
   JSON.stringify-ing an already-parsed object, which isn't guaranteed to
   reproduce the original bytes) is what Razorpay's own docs require. ── */
export const razorpayWebhook = async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;

  const generated = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("hex");

  if (generated !== signature) {
    console.error("❌ Razorpay webhook signature mismatch");
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }

  const event = JSON.parse(req.body.toString("utf8"));
  console.log("🔔 Razorpay event:", event.event);

  if (event.event === "payment.failed")   return handlePaymentFailed(event, res);
  if (event.event === "refund.created")   return handleRefundStatus(event, res, "pending");
  if (event.event === "refund.processed") return handleRefundStatus(event, res, "refunded");
  if (event.event === "refund.failed") {
    console.log("⚠️ Refund failed on Razorpay side:", event.payload.refund?.entity?.payment_id);
    return res.json({ received: true });
  }

  /* ── Only handle payment.captured beyond this point ── */
  if (event.event !== "payment.captured")
    return res.json({ received: true });

  const payment = event.payload.payment.entity;
  const notes   = payment.notes || {};

  if (notes.type !== "coins_purchase") {
    console.log("⚠️ Not a coins purchase");
    return res.json({ received: true });
  }

  const { userId, plan_id, coins } = notes;
  const paymentId   = payment.id;
  const amount      = payment.amount / 100; // cents → USD

  if (!userId || !plan_id || !coins) {
    console.error("❌ Missing notes metadata");
    return res.json({ received: true });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    /* ── Duplicate check ── */
    const [[existing]] = await conn.query(
      `SELECT id FROM coins_transactions WHERE reference_id = ? LIMIT 1`,
      [paymentId]
    );
    if (existing) {
      console.log("⚠️ Duplicate ignored:", paymentId);
      await conn.rollback();
      conn.release();
      return res.json({ received: true });
    }
 
    /* ── Plan verify ── */
    const [[plan]] = await conn.query(
      `SELECT id, name, matches, validity_days FROM subscription_plans WHERE id = ? LIMIT 1`,
      [plan_id]
    );
    if (!plan) throw new Error("Plan not found");

    /* ── Wallet ── */
    const [[wallet]] = await conn.query(
      `SELECT coins, total_coins, available_coins FROM user_coins WHERE user_id = ? FOR UPDATE`,
      [userId]
    );

    /* ── User ── */
    const [[userInfo]] = await conn.query(
      `SELECT fullname, email, mobile FROM users WHERE id = ?`,
      [userId]
    );

    const parsedCoins  = Number(coins);
    const openingCoins = wallet ? Number(wallet.available_coins) : 0;
    const closingCoins = openingCoins + parsedCoins;

    /* ── Coins update ── */
    if (wallet) {
      await conn.query(
        `UPDATE user_coins
         SET coins = coins + ?, total_coins = total_coins + ?, available_coins = available_coins + ?
         WHERE user_id = ?`,
        [parsedCoins, parsedCoins, parsedCoins, userId]
      );
    } else {
      await conn.query(
        `INSERT INTO user_coins (user_id, coins, total_coins, used_coins, available_coins)
         VALUES (?, ?, ?, 0, ?)`,
        [userId, parsedCoins, parsedCoins, parsedCoins]
      );
    }

    /* ── Transaction log ── */
    const [txResult] = await conn.query(
      `INSERT INTO coins_transactions
         (user_id, plan_id, coins, amount, opening_points, closing_points,
          reference_id, status, user_name, user_email, user_mobile)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?)`,
      [
        userId, plan_id, parsedCoins, amount,
        openingCoins, closingCoins, paymentId,
        userInfo?.fullname || null,
        userInfo?.email    || null,
        userInfo?.mobile   || null,
      ]
    );

    /* ── Subscription ── */
    await conn.query(
      `INSERT INTO user_subscriptions
         (user_id, plan_id, plan_name, coins, matches_allowed,
          amount, payment_reference, status, start_date, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [
        userId, plan_id, plan.name, parsedCoins,
        plan.matches, amount, paymentId, plan.validity_days,
      ]
    );

    /* ── Company ledger — balance tracked on a fixed single row
       (company_balance, id=1), not "last row of company_ledger" (a moving
       target that deadlocks under concurrent writes — see deposite.controller.js
       for the same fix applied there). ── */
    const [[bal]] = await conn.query(
      `SELECT balance FROM company_balance WHERE id = 1 FOR UPDATE`
    );
    const companyOpening = bal ? Number(bal.balance) : 0;
    const companyClosing = companyOpening + amount;

    await conn.query(
      `UPDATE company_balance SET balance = ? WHERE id = 1`,
      [companyClosing]
    );

    await conn.query(
      `INSERT INTO company_ledger
         (transaction_id, user_id, user_name, user_email,
          plan_name, amount, opening_balance, closing_balance, payment_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txResult.insertId, userId,
        userInfo?.fullname || null,
        userInfo?.email    || null,
        plan.name, amount, companyOpening, companyClosing, paymentId,
      ]
    );

    await conn.commit();  
   
    /* ── Email ── */
    try {
      await sendBillingMail({
        to:      userInfo?.email,
        subject: `Coin Purchase Successful · ${plan.name}`,
        html:    coinPurchaseEmailHtml({
          fullname:       userInfo?.fullname || "User",
          planName:       plan.name,
          coins:          parsedCoins,
          currentBalance: closingCoins,
          currency:       "$",
          amount,
          transactionId:  paymentId,
          purchaseDate:   new Date().toLocaleDateString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
          }),
        }),
      });
      console.log(`✅ Email sent to ${userInfo?.email}`);
    } catch (mailErr) {
      console.warn(`⚠️ Email failed: ${mailErr.message}`);
    }

    await sendPushToUser({
      userId,
      title: "Coin Pack Purchased",
      body: `${parsedCoins} coins from ${plan.name} have been added to your account.`,
      data: { type: "coin_pack_purchased", plan_id: plan_id, coins: parsedCoins },
    });

    console.log(`✅ Coins added — userId:${userId} coins:${parsedCoins} closing:${closingCoins}`);
    return res.json({ received: true });

  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("❌ Razorpay webhook failed:", err.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  } finally {
    conn.release();
  }
};

/* ── payment.failed — records the failed attempt so it shows up in
   admin finance reports ("Failed · charged" bucket) instead of silently
   vanishing. No coins are credited. ── */
const handlePaymentFailed = async (event, res) => {
  const payment = event.payload.payment.entity;
  const notes   = payment.notes || {};

  if (notes.type !== "coins_purchase" || !notes.userId || !notes.plan_id) {
    return res.json({ received: true });
  }

  const { userId, plan_id, coins } = notes;
  const paymentId = payment.id;

  try {
    const [[existing]] = await db.query(
      `SELECT id FROM coins_transactions WHERE reference_id = ? LIMIT 1`,
      [paymentId]
    );
    if (existing) {
      console.log("⚠️ Duplicate payment.failed ignored:", paymentId);
      return res.json({ received: true });
    }

    const [[userInfo]] = await db.query(
      `SELECT fullname, email, mobile FROM users WHERE id = ?`,
      [userId]
    );
    const [[wallet]] = await db.query(
      `SELECT available_coins FROM user_coins WHERE user_id = ?`,
      [userId]
    );
    const openingCoins = wallet ? Number(wallet.available_coins) : 0;

    await db.query(
      `INSERT INTO coins_transactions
         (user_id, plan_id, coins, amount, opening_points, closing_points,
          reference_id, status, user_name, user_email, user_mobile)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'failed', ?, ?, ?)`,
      [
        userId, plan_id, Number(coins) || 0, payment.amount / 100,
        openingCoins, openingCoins, paymentId,
        userInfo?.fullname || null,
        userInfo?.email    || null,
        userInfo?.mobile   || null,
      ]
    );

    console.log(`⚠️ Payment failed recorded — userId:${userId} paymentId:${paymentId}`);
    return res.json({ received: true });
  } catch (err) {
    console.error("❌ payment.failed handling error:", err.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};

/* ── refund.created / refund.processed — mirrors Razorpay's refund
   progress onto the original transaction row (matched via reference_id
   = the original payment_id) so it surfaces in admin finance reports. ── */
const handleRefundStatus = async (event, res, status) => {
  const refund    = event.payload.refund?.entity;
  const paymentId = refund?.payment_id;

  if (!paymentId) return res.json({ received: true });

  try {
    const [[tx]] = await db.query(
      `SELECT id FROM coins_transactions WHERE reference_id = ? LIMIT 1`,
      [paymentId]
    );
    if (!tx) {
      console.log(`⚠️ Refund event for unknown payment: ${paymentId}`);
      return res.json({ received: true });
    }

    await db.query(`UPDATE coins_transactions SET status = ? WHERE id = ?`, [status, tx.id]);

    if (status === "refunded") {
      await db.query(
        `UPDATE user_subscriptions SET status = 'cancelled' WHERE payment_reference = ? AND status = 'active'`,
        [paymentId]
      );
    }

    console.log(`💸 ${event.event} — paymentId:${paymentId} → status:${status}`);
    return res.json({ received: true });
  } catch (err) {
    console.error(`❌ ${event.event} handling error:`, err.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};