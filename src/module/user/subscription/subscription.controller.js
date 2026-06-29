import db from "../../../config/db.js";

import {  getMySubscriptionService } from "./subscription.service.js";


export const getActivePlans = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         id, name, subtitle, coins, bonus_coins, matches,
         price, price_per_coin, validity_days,
         is_popular, is_pro, sort_order, offer_label
       FROM subscription_plans
       WHERE is_active = 1
       ORDER BY sort_order ASC`
    );

    res.status(200).json({
      success: true,
      total:   rows.length,
      data:    rows,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
 
export const getMySubscription = async (req, res) => {
  try {
    const subscription = await getMySubscriptionService(req.user.id);

    return res.status(200).json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};