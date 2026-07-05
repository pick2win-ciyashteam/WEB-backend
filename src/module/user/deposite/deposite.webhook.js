import crypto from "crypto";
import db      from "../../../config/db.js";
import { sendBillingMail, coinPurchaseEmailHtml } from "../../../utils/mailer.js";

/* ── Razorpay sends JSON body — no raw buffer needed ── */
export const razorpayWebhook = async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;

  /* ── Signature verify ── */
  const generated = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (generated !== signature) {
    console.error("❌ Razorpay webhook signature mismatch");
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }

  const event = req.body;
  console.log("🔔 Razorpay event:", event.event);

  /* ── Only handle payment.captured ── */
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
  const amount      = payment.amount / 100; // paise → INR

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

    /* ── Company ledger ── */
    const [[lastEntry]] = await conn.query(
      `SELECT closing_balance FROM company_ledger ORDER BY id DESC LIMIT 1`
    );
    const companyOpening = lastEntry ? Number(lastEntry.closing_balance) : 0;
    const companyClosing = companyOpening + amount;

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
          currency:       "₹",
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