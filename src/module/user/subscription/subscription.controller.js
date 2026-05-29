import db from "../../../config/db.js";

export const getActivePlans = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         id, name, subtitle, coins, matches,
         price, price_per_coin, currency, currency_symbol,
         validity_days, is_popular, is_pro, sort_order
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