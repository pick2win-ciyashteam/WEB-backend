import db from "../../../config/db.js";

/* ════════════════════════════════════════════
   💰 ADD COINS (Purchase)
════════════════════════════════════════════ */
export const addCoinsService = async (userId, planId, coins, amount, referenceId) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* ── 1. Duplicate check ── */
    const [[existing]] = await conn.query(
      `SELECT id FROM coins_transactions WHERE reference_id = ? LIMIT 1`,
      [referenceId]
    );
    if (existing) throw new Error("Payment already processed");

    /* ── 2. User verify ── */
    const [[user]] = await conn.query(
      `SELECT id, fullname, email, mobile FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) throw new Error("User not found");

    /* ── 3. Current wallet ── */
    const [[wallet]] = await conn.query(
      `SELECT coins, total_coins, available_coins, used_coins FROM user_coins WHERE user_id = ? FOR UPDATE`,
      [userId]
    );

    const openingCoins = wallet ? Number(wallet.available_coins) : 0;
    const closingCoins = openingCoins + Number(coins);

    /* ── 4. Coins update or insert ── */
    if (wallet) {
      await conn.query(
        `UPDATE user_coins
         SET coins = coins + ?,
             total_coins = total_coins + ?,
             available_coins = available_coins + ?
         WHERE user_id = ?`,
        [coins, coins, coins, userId]
      );
    } else {
      await conn.query(
        `INSERT INTO user_coins (user_id, coins, total_coins, available_coins, used_coins)
         VALUES (?, ?, ?, ?, 0)`,
        [userId, coins, coins, coins]
      );
    }

    /* ── 5. Transaction record ── */
    const [txResult] = await conn.query(
      `INSERT INTO coins_transactions
         (user_id, plan_id, coins, amount,
          opening_points, closing_points,
          reference_id, status,
          user_name, user_email, user_mobile, transaction_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'success', ?, ?, ?, 'credit')`,
      [
        userId, planId, coins, amount,
        openingCoins, closingCoins,
        referenceId,
        user.fullname || null,
        user.email || null,
        user.mobile || null,
      ]
    );

    await conn.commit();

    console.log(`✅ Coins Added - User:${userId} Coins:${coins} Closing:${closingCoins}`);
    return {
      success: true,
      message: "Coins added successfully",
      transaction: {
        id: txResult.insertId,
        userId,
        coins: Number(coins),
        closingCoins,
        type: "credit",
      },
    };

  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error(`❌ addCoinsService:`, err.message);
    throw err;
  } finally {
    conn.release();
  }
};

/* ════════════════════════════════════════════
   💸 SPEND COINS (Match Generation)
════════════════════════════════════════════ */
export const spendCoinsService = async (
  userId,
  coinsToSpend,
  matchId = null,
  description = "Match generated"
) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* ── 1. User verify ── */
    const [[user]] = await conn.query(
      `SELECT id, fullname, email, mobile FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) throw new Error("User not found");

    /* ── 2. Check available coins ── */
    const [[wallet]] = await conn.query(
      `SELECT coins, total_coins, available_coins, used_coins FROM user_coins 
       WHERE user_id = ? FOR UPDATE`,
      [userId]
    );

    if (!wallet || Number(wallet.available_coins) < coinsToSpend) {
      throw new Error("Insufficient coins");
    }

    const openingCoins = Number(wallet.available_coins);
    const closingCoins = openingCoins - coinsToSpend;
    const totalUsed = (Number(wallet.used_coins) || 0) + coinsToSpend;

    /* ── 3. Update coins ── */
    await conn.query(
      `UPDATE user_coins
       SET available_coins = available_coins - ?,
           used_coins = used_coins + ?
       WHERE user_id = ?`,
      [coinsToSpend, coinsToSpend, userId]
    );

    /* ── 4. Transaction record ── */
    const referenceId = matchId
      ? `MATCH_${matchId}_${Date.now()}`
      : `SPEND_${userId}_${Date.now()}`;

    const [txResult] = await conn.query(
      `INSERT INTO coins_transactions
         (user_id, coins, amount,
          opening_points, closing_points,
          reference_id, status,
          user_name, user_email, user_mobile,
          transaction_type, description, match_id)
       VALUES (?, ?, 0,
               ?, ?, ?, 'success',
               ?, ?, ?, 'debit', ?, ?)`,
      [
        userId, -coinsToSpend,
        openingCoins, closingCoins,
        referenceId,
        user.fullname || null,
        user.email || null,
        user.mobile || null,
        description,
        matchId || null,
      ]
    );

    await conn.commit();

    console.log(`✅ Coins Spent - User:${userId} Coins:${coinsToSpend} Closing:${closingCoins}`);
    return {
      success: true,
      message: "Coins deducted successfully",
      transaction: {
        id: txResult.insertId,
        userId,
        coinsSpent: coinsToSpend,
        closingCoins,
        totalUsed,
        type: "debit",
      },
    };

  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error(`❌ spendCoinsService:`, err.message);
    throw err;
  } finally {
    conn.release();
  }
};

/* ════════════════════════════════════════════
   📊 GET USER TRANSACTIONS
════════════════════════════════════════════ */
export const getUserTransactionsService = async (userId, filters = {}) => {
  const {
    type = null,        // 'credit' or 'debit'
    status = null,      // transaction status (don't default to 'success')
    limit = 50,
    offset = 0,
  } = filters;

  try {
    let whereClause = `user_id = ?`;
    const params = [userId];

    if (type) {
      whereClause += ` AND transaction_type = ?`;
      params.push(type);
    }

    if (status) {
      whereClause += ` AND status = ?`;
      params.push(status);
    }

    // Get transactions
    const [transactions] = await db.execute(
      `SELECT
         id,
         coins,
         status,
         transaction_type,
         description,
         match_id,
         created_at
       FROM coins_transactions
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    // Get total count with same filters
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) as total FROM coins_transactions WHERE ${whereClause}`,
      params
    );

    return {
      success: true,
      total,
      limit,
      offset,
      count: transactions.length,
      data: transactions,
    };

  } catch (err) {
    console.error(`❌ getUserTransactionsService:`, err.message);
    throw err;
  }
};

/* ════════════════════════════════════════════
   💰 GET WALLET STATS
════════════════════════════════════════════ */
export const getWalletStatsService = async (userId) => {
  try {
    const [[wallet]] = await db.execute(
      `SELECT coins, total_coins, available_coins, used_coins 
       FROM user_coins WHERE user_id = ?`,
      [userId]
    );

    if (!wallet) {
      return {
        success: true,
        wallet: {
          total_coins: 0,
          available_coins: 0,
          used_coins: 0,
        },
      };
    }

    return {
      success: true,
      wallet: {
        total_coins: Number(wallet.total_coins),
        available_coins: Number(wallet.available_coins),
        used_coins: Number(wallet.used_coins),
      },
    };

  } catch (err) {
    console.error(`❌ getWalletStatsService:`, err.message);
    throw err;
  }
};
