import db       from "../../../config/db.js";
import Razorpay from "razorpay";
import crypto   from "crypto";
import {
  spendCoinsService,
  getUserTransactionsService,
  getWalletStatsService,
} from "./transaction.service.js";
import { sendPushToUser } from "../../../utils/notification.js";

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ================= CREATE COINS ORDER ================= */
export const createCoinsPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan_id, amount, coins } = req.body;

    if (!plan_id || !amount || !coins)
      return res.status(400).json({ success: false, message: "plan_id, amount, coins required" });

    const [[plan]] = await db.execute(
      `SELECT id, coins, price, name FROM subscription_plans WHERE id = ? AND is_active = 1`,
      [plan_id]
    );
    if (!plan)
      return res.status(400).json({ success: false, message: "Invalid plan" });

    const amountPaise = Math.round(Number(amount) * 100); // INR paise
    if (amountPaise < 100)
      return res.status(400).json({ success: false, message: "Minimum amount is $1" });

    const order = await razorpay.orders.create({
      amount,
      currency: "USD",
      receipt:  `receipt_${userId}_${plan_id}_${Date.now()}`,
      notes: {
        userId:  String(userId),
        plan_id: String(plan_id),
        coins:   String(coins),
        type:    "coins_purchase",
      },
    });

    res.status(200).json({
      success:  true,
      order_id: order.id,
      amount:   order.amount,
      currency: order.currency,
      key_id:   process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error("❌ createCoinsPayment:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= VERIFY PAYMENT ================= */
export const verifyCoinsPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan_id,
      coins,
      amount,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_id || !coins || !amount)
      return res.status(400).json({ success: false, message: "Missing required fields" });

    /* ── Signature verify ── */
    const generated = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated !== razorpay_signature)
      return res.status(400).json({ success: false, message: "Payment verification failed" });

    const userId        = req.user.id;
    const parsedCoins   = Number(coins);
    const parsedAmount  = Number(amount) / 100; // paise → INR

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      /* ── Duplicate check ── */
      const [[existing]] = await conn.query(
        `SELECT id FROM coins_transactions WHERE reference_id = ? LIMIT 1`,
        [razorpay_payment_id]
      );
      if (existing) {
        await conn.rollback();
        conn.release();
        return res.json({ success: true, message: "Already processed" });
      }

      /* ── Plan verify ── */
      const [[plan]] = await conn.query(
        `SELECT id, name, matches, validity_days FROM subscription_plans WHERE id = ? LIMIT 1`,
        [plan_id]
      );
      if (!plan) throw new Error("Plan not found");

      /* ── Current wallet ── */
      const [[wallet]] = await conn.query(
        `SELECT coins, total_coins, available_coins FROM user_coins WHERE user_id = ? FOR UPDATE`,
        [userId]
      );

      /* ── User fetch ── */
      const [[userInfo]] = await conn.query(
        `SELECT fullname, email, mobile FROM users WHERE id = ?`,
        [userId]
      );

      const openingCoins = wallet ? Number(wallet.available_coins) : 0;
      const closingCoins = openingCoins + parsedCoins;

      /* ── Coins update or insert ── */
      if (wallet) {
        await conn.query(
          `UPDATE user_coins
           SET coins           = coins + ?,
               total_coins     = total_coins + ?,
               available_coins = available_coins + ?
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

      /* ── Coins transaction log ── */
      const [txResult] = await conn.query(
        `INSERT INTO coins_transactions
           (user_id, plan_id, coins, amount,
            opening_points, closing_points,
            reference_id, status,
            user_name, user_email, user_mobile)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?)`,
        [
          userId, plan_id, parsedCoins, parsedAmount,
          openingCoins, closingCoins,
          razorpay_payment_id,
          userInfo?.fullname || null,
          userInfo?.email    || null,
          userInfo?.mobile   || null,
        ]
      );

      /* ── Subscription record ── */
      await conn.query(
        `INSERT INTO user_subscriptions
           (user_id, plan_id, plan_name, coins, matches_allowed,
            amount, payment_reference, status, start_date, expiry_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
        [
          userId, plan_id, plan.name, parsedCoins,
          plan.matches, parsedAmount, razorpay_payment_id,
          plan.validity_days,
        ]
      );

      /* ── Company ledger ── */
      const [[lastEntry]] = await conn.query(
        `SELECT closing_balance FROM company_ledger ORDER BY id DESC LIMIT 1`
      );
      const companyOpening = lastEntry ? Number(lastEntry.closing_balance) : 0;
      const companyClosing = companyOpening + parsedAmount;

      await conn.query(
        `INSERT INTO company_ledger
           (transaction_id, user_id, user_name, user_email,
            plan_name, amount, opening_balance, closing_balance, payment_reference)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          txResult.insertId, userId,
          userInfo?.fullname || null,
          userInfo?.email    || null,
          plan.name, parsedAmount,
          companyOpening, companyClosing,
          razorpay_payment_id,
        ]
      );

      await conn.commit();

      console.log(`✅ Coins added — userId:${userId} coins:${parsedCoins} closing:${closingCoins}`);

      await sendPushToUser({
        userId,
        title: "Coin Pack Purchased",
        body: `${parsedCoins} coins from ${plan.name} have been added to your account.`,
        data: { type: "coin_pack_purchased", plan_id: plan_id, coins: parsedCoins },
      });

      return res.json({ success: true, message: "Payment verified and coins credited" });

    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }

  } catch (err) {
    console.error("❌ verifyCoinsPayment:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET RAZORPAY CONFIG ================= */
export const getRazorpayConfig = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      key_id:  process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET MY COINS ================= */
export const getMyCoins = async (req, res) => {
  try {
    const [[wallet]] = await db.execute(
      `SELECT available_coins, used_coins, total_coins
       FROM user_coins WHERE user_id = ?`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      wallet: {
        total_coins:     wallet ? Number(wallet.total_coins)     : 0,
        used_coins:      wallet ? Number(wallet.used_coins)      : 0,
        available_coins: wallet ? Number(wallet.available_coins) : 0,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET MY TRANSACTIONS ================= */
export const getMyTransactions = async (req, res) => {
  try {
    const [transactions] = await db.execute(
      `SELECT
         ct.id,
         ct.coins,
         ct.amount,
         ct.opening_points  AS opening_coins,
         ct.closing_points  AS closing_coins,
         ct.reference_id,
         ct.status,
         ct.created_at,
         CASE WHEN ct.coins > 0 THEN 'purchase' ELSE 'spent' END AS transaction_type,
         sp.name     AS plan_name,
         sp.subtitle AS plan_subtitle
       FROM coins_transactions ct
       LEFT JOIN subscription_plans sp ON sp.id = ct.plan_id
       WHERE ct.user_id = ?
       ORDER BY ct.id DESC`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      total:   transactions.length,
      data:    transactions,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= SPEND COINS (Match Entry) ================= */
export const spendCoins = async (req, res) => {
  try {
    const userId = req.user.id;
    const { coins, match_id, description } = req.body;

    if (!coins || coins <= 0)
      return res.status(400).json({ success: false, message: "Invalid coins amount" });

    const result = await spendCoinsService(
      userId,
      coins,
      match_id || null,
      description || "Match generated"
    );

    res.status(200).json(result);

  } catch (err) {
    console.error("❌ spendCoins:", err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= GET WALLET STATS ================= */
export const getWalletStats = async (req, res) => {
  try {
    const result = await getWalletStatsService(req.user.id);
    res.status(200).json(result);

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET FILTERED TRANSACTIONS ================= */
export const getFilteredTransactions = async (req, res) => {
  try {
    const { type, status } = req.query;
    let limit = parseInt(req.query.limit) || 50;
    let offset = parseInt(req.query.offset) || 0;

    // Validation
    limit = Math.min(Math.max(limit, 1), 100);  // Between 1-100
    offset = Math.max(offset, 0);               // Not negative

    const result = await getUserTransactionsService(req.user.id, {
      type: type || null,
      status: status || null,
      limit,
      offset,
    });

    res.status(200).json(result);

  } catch (err) {
    console.error("❌ getFilteredTransactions:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};