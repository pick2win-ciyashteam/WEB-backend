import db from "../../../config/db.js";

/* ================= ADD COINS SERVICE ================= */
export const addCoinsService = async (userId, planId, coins, amount, paymentIntentId) => {

  if (!userId || !planId || !coins || !amount)
    throw new Error("Invalid parameters");

  const safePaymentIntentId = typeof paymentIntentId === "string"
    ? paymentIntentId.trim().slice(0, 200)
    : null;

  if (!safePaymentIntentId)
    throw new Error("Invalid payment reference");

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* ── Duplicate check ── */
    const [[existing]] = await conn.query(
      `SELECT id FROM points_transactions WHERE reference_id = ? LIMIT 1`,
      [safePaymentIntentId]
    );
    if (existing) throw new Error("Payment already processed");

    /* ── Plan verify ── */
    const [[plan]] = await conn.query(
      `SELECT id, coins, price FROM subscription_plans WHERE id = ? LIMIT 1`,
      [planId]
    );
    if (!plan) throw new Error("Plan not found");

    /* ── User verify ── */
    const [[user]] = await conn.query(
      `SELECT id FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) throw new Error("User not found");

    /* ── Current coins ── */
    const [[coinsRow]] = await conn.query(
      `SELECT coins FROM user_coins WHERE user_id = ? FOR UPDATE`,
      [userId]
    );

    const openingCoins = coinsRow ? Number(coinsRow.coins) : 0;
    const closingCoins = openingCoins + Number(coins);

    /* ── Coins update or insert ── */
    if (coinsRow) {
      await conn.query(
        `UPDATE user_coins SET coins = coins + ? WHERE user_id = ?`,
        [coins, userId]
      );
    } else {
      await conn.query(
        `INSERT INTO user_coins (user_id, coins) VALUES (?, ?)`,
        [userId, coins]
      );
    }

    /* ── Transaction log ── */
    await conn.query(
      `INSERT INTO points_transactions
         (user_id, plan_id, coins, amount, opening_points, closing_points, reference_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success')`,
      [userId, planId, coins, amount, openingCoins, closingCoins, safePaymentIntentId]
    );

    await conn.commit();

    return {
      success:    true,
      addedCoins: Number(coins),
      totalCoins: closingCoins,
    };

  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error(`[addCoinsService] error: ${err.message}`);
    throw err;
  } finally {
    conn.release();
  }
};