import db from  "../../../config/db.js";


/* ================= ADD POINTS SERVICE ================= */
export const addPointsService = async (userId, planId, coins, amount, paymentIntentId) => {

  if (!userId || !planId || !coins || !amount)
    throw new Error("Invalid parameters");

  const safePaymentIntentId = typeof paymentIntentId === "string"  
    ? paymentIntentId.trim().slice(0, 200)
    : null;

  if (!safePaymentIntentId && process.env.NODE_ENV === "production")
    throw new Error("Invalid payment reference");

  const conn = await db.getConnection();

  try {

    // ── Lock ──
    const [[lockResult]] = await conn.query(
      `SELECT GET_LOCK('points_lock_${userId}', 10) AS locked`
    );
    if (!lockResult?.locked) throw new Error("Server busy, please try again");

    await conn.beginTransaction();

    // ── Duplicate check ──
    const [[existing]] = await conn.query(
      `SELECT id FROM points_transactions WHERE reference_id = ? LIMIT 1`,
      [safePaymentIntentId]
    );
    if (existing) throw new Error("Payment already processed");

    // ── Plan verify ──
    const [[plan]] = await conn.query(
      `SELECT id, coins, price FROM plans WHERE id = ? LIMIT 1`,
      [planId]
    );
    if (!plan) throw new Error("Plan not found");

    // ── User fetch ──
    const [[user]] = await conn.query(
      `SELECT name, email, mobile FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) throw new Error("User not found");

    // ── Current points ──
    const [[pointsRow]] = await conn.query(
      `SELECT points FROM user_points WHERE user_id = ? FOR UPDATE`,
      [userId]
    );

    const openingPoints = pointsRow ? Number(pointsRow.points) : 0;
    const closingPoints = openingPoints + coins;

    // ── Points update or insert ──
    if (pointsRow) {
      await conn.query(
        `UPDATE user_points SET points = points + ? WHERE user_id = ?`,
        [coins, userId]
      );
    } else {
      await conn.query(
        `INSERT INTO user_points (user_id, points) VALUES (?, ?)`,
        [userId, coins]
      );
    }

    // ── Transaction log ──
    await conn.query(
      `INSERT INTO points_transactions
       (user_id, plan_id, coins, amount, opening_points, closing_points, reference_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success')`,
      [userId, planId, coins, amount, openingPoints, closingPoints, safePaymentIntentId]
    );

    await conn.commit();

    return {
      success:       true,
      addedCoins:    coins,
      totalCoins:    closingPoints,
    };

  } catch (err) {
    await conn.rollback().catch(() => {});
    if (process.env.NODE_ENV !== "production")
      console.error(`[addPointsService] userId=${userId} coins=${coins} error=${err.message}`);
    throw err;
  } finally {
    await conn.query(`SELECT RELEASE_LOCK('points_lock_${userId}')`).catch(() => {});
    conn.release();
  }
};