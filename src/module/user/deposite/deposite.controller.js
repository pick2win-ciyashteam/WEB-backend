 import db from "../../../config/db.js";  

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* ================= CREATE COINS PAYMENT ================= */

 export const createCoinsPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan_id, amount, coins } = req.body;
 

    if (!plan_id || !amount || !coins)
      return res.status(400).json({ success: false, message: "plan_id, amount, coins required" });

    const sanitizedAmount = Math.round(Number(amount) * 100) / 100;

    const paymentIntent = await stripe.paymentIntents.create({
  amount:   Math.round(sanitizedAmount * 100),
  currency: "gbp",

 
  //  add this — card only
  payment_method_types: ["card"],

  metadata: {
    userId:  String(userId),
    plan_id: String(plan_id),
    coins:   String(coins),
    type:    "coins_purchase",
  },
});
 
    console.log("PaymentIntent created:", paymentIntent.id);
    console.log(" Metadata:", paymentIntent.metadata);

    res.status(200).json({
      success:      true,
      clientSecret: paymentIntent.client_secret,
    });

  } catch (err) {
    console.error("❌ createCoins  error:", err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};
/* ================= GET STRIPE CONFIG ================= */
export const getStripeConfig = async (req, res) => {
  try {
    res.status(200).json({
      success:        true,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET MY COINS ================= */
export const getMyCoins = async (req, res) => {
  try {
    const [[coins]] = await db.execute(
      `SELECT coins FROM user_coins WHERE user_id = ?`,
      [req.user.id]
    );

    res.status(200).json({
      success: true,
      coins:  coins ? Number(coins.coins) : 0,
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
         pt.id,
         pt.coins,
         pt.amount,
         pt.opening_points,
         pt.closing_points,
         pt.reference_id,
         pt.status,
         pt.created_at,
         sp.name     AS plan_name,
         sp.subtitle AS plan_subtitle
       FROM coins_transactions pt
       LEFT JOIN subscription_plans sp ON sp.id = pt.plan_id
       WHERE pt.user_id = ?
       ORDER BY pt.id DESC`,
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