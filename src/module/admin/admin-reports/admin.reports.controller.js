// reports.controller.js
import db from "../../../config/db.js";

export const getDashboardReport = async (req, res) => {
  try {
    /* ── 1. Total Users ── */
    const [[totalUsers]] = await db.execute(
      `SELECT 
         COUNT(*) AS total,
         SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS this_week
       FROM users
       WHERE account_status != 'deleted'`
    );

    /* ── 2. Verified Users ── */
    const [[verified]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE account_status != 'deleted'
         AND email_verify  = 1
         AND mobile_verify = 1`
    );

    /* ── 3. Coin Pack Buyers ── */
    const [[coinBuyers]] = await db.execute(
      `SELECT COUNT(DISTINCT user_id) AS total
       FROM coins_transactions
       WHERE coins > 0
         AND status = 'success'`
    );

  /* ── 4. Active Users (last 30 days) ── */
const [[activeUsers]] = await db.execute(
  `SELECT COUNT(DISTINCT u.id) AS total
   FROM users u
   WHERE u.account_status != 'deleted'
     AND (
       EXISTS (
         SELECT 1 FROM match_generation_log m
         WHERE m.user_id    = u.id
           AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       )
       OR EXISTS (
         SELECT 1 FROM coins_transactions ct
         WHERE ct.user_id    = u.id
           AND ct.coins      > 0
           AND ct.status     = 'success'
           AND ct.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       )
     )`
);

    /* ── 5. Dormant Users (30+ days no activity) ── */
    const [[dormantUsers]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM users u
       WHERE u.account_status != 'deleted'
         AND u.email_verify  = 1
         AND u.mobile_verify = 1
         AND NOT EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         )`
    );

    const totalVerified = Number(verified.total);
    const totalAll      = Number(totalUsers.total);

    return res.status(200).json({
      success: true,
      data: {
        total_users: {
          count:     totalAll,
          this_week: Number(totalUsers.this_week),
        },
        verified: {
          count:      totalVerified,
          percentage: totalAll > 0
            ? ((totalVerified / totalAll) * 100).toFixed(1)
            : "0.0",
        },
        coin_pack_buyers: {
          count:      Number(coinBuyers.total),
          percentage: totalVerified > 0
            ? ((Number(coinBuyers.total) / totalVerified) * 100).toFixed(1)
            : "0.0",
        },
        active_30d: {
          count:      Number(activeUsers.total),
          percentage: totalVerified > 0
            ? ((Number(activeUsers.total) / totalVerified) * 100).toFixed(1)
            : "0.0",
        },
        dormant_30d: {
          count:      Number(dormantUsers.total),
          percentage: totalAll > 0
            ? ((Number(dormantUsers.total) / totalAll) * 100).toFixed(1)
            : "0.0",
        },
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getGeographyReport = async (req, res) => {
  try {
    /* ── Per country data ── */
    const [countries] = await db.execute(
      `SELECT
         u.country,

         COUNT(DISTINCT u.id) AS total_users,

         COUNT(DISTINCT CASE
           WHEN u.email_verify = 1 AND u.mobile_verify = 1
           THEN u.id END)       AS verified,

         COUNT(DISTINCT ct.user_id) AS coin_buyers,

         COUNT(DISTINCT CASE
           WHEN EXISTS (
             SELECT 1 FROM match_generation_log m
             WHERE m.user_id    = u.id
               AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           ) OR EXISTS (
             SELECT 1 FROM coins_transactions c2
             WHERE c2.user_id    = u.id
               AND c2.coins      > 0
               AND c2.status     = 'success'
               AND c2.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           )
           THEN u.id END)       AS active_30d,

         COUNT(DISTINCT CASE
           WHEN u.email_verify = 1
             AND u.mobile_verify = 1
             AND NOT EXISTS (
               SELECT 1 FROM match_generation_log m2
               WHERE m2.user_id    = u.id
                 AND m2.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             )
             AND NOT EXISTS (
               SELECT 1 FROM coins_transactions c3
               WHERE c3.user_id    = u.id
                 AND c3.coins      > 0
                 AND c3.status     = 'success'
                 AND c3.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             )
           THEN u.id END)       AS dormant_30d,

         COALESCE(SUM(DISTINCT ct_sum.amount), 0) AS lifetime_revenue

       FROM users u

       LEFT JOIN coins_transactions ct
         ON ct.user_id = u.id
        AND ct.coins   > 0
        AND ct.status  = 'success'

       LEFT JOIN (
         SELECT user_id, SUM(amount) AS amount
         FROM coins_transactions
         WHERE coins > 0 AND status = 'success'
         GROUP BY user_id
       ) ct_sum ON ct_sum.user_id = u.id

       WHERE u.account_status != 'deleted'
       GROUP BY u.country
       ORDER BY total_users DESC`
    );

    /* ── Totals ── */
    const totals = countries.reduce(
      (acc, row) => {
        acc.total_users     += Number(row.total_users);
        acc.verified        += Number(row.verified);
        acc.coin_buyers     += Number(row.coin_buyers);
        acc.active_30d      += Number(row.active_30d);
        acc.dormant_30d     += Number(row.dormant_30d);
        acc.lifetime_revenue += Number(row.lifetime_revenue);
        return acc;
      },
      {
        total_users:      0,
        verified:         0,
        coin_buyers:      0,
        active_30d:       0,
        dormant_30d:      0,
        lifetime_revenue: 0,
      }
    );

    /* ── Format rows ── */
    const data = countries.map((row) => ({
      country:          row.country,
      total_users:      Number(row.total_users),
      verified:         Number(row.verified),
      coin_buyers:      Number(row.coin_buyers),
      active_30d:       Number(row.active_30d),
      dormant_30d:      Number(row.dormant_30d),
      lifetime_revenue: Number(row.lifetime_revenue).toFixed(2),
      percentage_of_total:
        totals.total_users > 0
          ? ((Number(row.total_users) / totals.total_users) * 100).toFixed(1)
          : "0.0",
    }));

    return res.status(200).json({
      success:        true,
      total_markets:  countries.length,
      totals: {
        total_users:      totals.total_users,
        verified:         totals.verified,
        coin_buyers:      totals.coin_buyers,
        active_30d:       totals.active_30d,
        dormant_30d:      totals.dormant_30d,
        lifetime_revenue: totals.lifetime_revenue.toFixed(2),
      },
      data,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getPackBuyersReport = async (req, res) => {
  try {

    /* ── 1. Per Plan Summary ── */
    const [planStats] = await db.execute(
      `SELECT
         sp.id                                        AS plan_id,
         sp.name                                      AS plan_name,
         sp.coins                                     AS plan_coins,
         sp.price                                     AS plan_price,
         COUNT(ct.id)                                 AS purchases,
         COUNT(DISTINCT ct.user_id)                   AS unique_buyers,
         COALESCE(SUM(ct.coins), 0)                   AS coins_sold,
         COALESCE(SUM(ct.amount), 0)                  AS revenue,

         /* consumed coins — spent on UCT */
         COALESCE((
           SELECT SUM(ABS(s.coins))
           FROM coins_transactions s
           WHERE s.user_id IN (
             SELECT DISTINCT user_id FROM coins_transactions
             WHERE plan_id = sp.id AND coins > 0 AND status = 'success'
           )
           AND s.coins < 0 AND s.status = 'success'
         ), 0)                                        AS coins_consumed,

         /* last 30d purchases */
         COUNT(CASE
           WHEN ct.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           THEN 1 END)                                AS last_30d_purchases,

         /* last 30d revenue */
         COALESCE(SUM(CASE
           WHEN ct.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           THEN ct.amount ELSE 0 END), 0)             AS last_30d_revenue,

         /* still active buyers */
         COUNT(DISTINCT CASE
           WHEN us.status = 'active' AND us.expiry_date > NOW()
           THEN ct.user_id END)                       AS still_active

       FROM subscription_plans sp
       LEFT JOIN coins_transactions ct
         ON ct.plan_id = sp.id
        AND ct.coins   > 0
        AND ct.status  = 'success'
       LEFT JOIN user_subscriptions us
         ON us.plan_id  = sp.id
        AND us.user_id  = ct.user_id
       WHERE sp.is_active = 1
       GROUP BY sp.id, sp.name, sp.coins, sp.price
       ORDER BY purchases DESC`
    );

    /* ── 2. Overall Summary ── */
    const [[overall]] = await db.execute(
      `SELECT
         COUNT(DISTINCT user_id)        AS unique_buyers,
         COALESCE(SUM(coins), 0)        AS total_coins_sold,
         COALESCE(SUM(amount), 0)       AS total_revenue,
         COUNT(*)                       AS total_purchases
       FROM coins_transactions
       WHERE coins > 0 AND status = 'success'`
    );

    const [[consumed]] = await db.execute(
      `SELECT COALESCE(SUM(ABS(coins)), 0) AS total_consumed
       FROM coins_transactions
       WHERE coins < 0 AND status = 'success'`
    );

    /* ── 3. Revenue by Currency ── */
    const [currencyRevenue] = await db.execute(
      `SELECT
         sp.id        AS plan_id,
         sp.name      AS plan_name,
         sp.coins     AS plan_coins,
         sp.currency,
         COUNT(ct.id)              AS buyers,
         SUM(ct.amount)            AS revenue
       FROM coins_transactions ct
       JOIN subscription_plans sp ON sp.id = ct.plan_id
       WHERE ct.coins > 0 AND ct.status = 'success'
       GROUP BY sp.id, sp.name, sp.coins, sp.currency
       ORDER BY sp.id`
    );

    /* ── 4. Recent 12 purchases ── */
    const [recentPurchases] = await db.execute(
      `SELECT
         ct.user_id,
         ct.user_name,
         ct.user_email,
         u.country,
         sp.name          AS plan_name,
         sp.coins         AS plan_coins,
         ct.amount,
         sp.currency,
         ct.created_at    AS purchased_at,

         /* coins used */
         COALESCE((
           SELECT SUM(ABS(s.coins))
           FROM coins_transactions s
           WHERE s.user_id = ct.user_id
             AND s.coins   < 0
             AND s.status  = 'success'
         ), 0)            AS coins_used,

         /* coins remaining */
         uc.available_coins AS coins_remaining

       FROM coins_transactions ct
       JOIN subscription_plans sp ON sp.id    = ct.plan_id
       LEFT JOIN users          u  ON u.id     = ct.user_id
       LEFT JOIN user_coins     uc ON uc.user_id = ct.user_id
       WHERE ct.coins > 0 AND ct.status = 'success'
       ORDER BY ct.id DESC
       LIMIT 12`
    );

    /* ── 5. Format plan stats ── */
    const formattedPlans = planStats.map((p) => {
      const coinsSold     = Number(p.coins_sold);
      const coinsConsumed = Number(p.coins_consumed);
      const coinsRemaining = coinsSold - coinsConsumed;
      const usagePct      = coinsSold > 0
        ? ((coinsConsumed / coinsSold) * 100).toFixed(1)
        : "0.0";
      const avgPerUser    = Number(p.unique_buyers) > 0
        ? (coinsSold / Number(p.unique_buyers)).toFixed(1)
        : "0.0";

      return {
        plan_id:           p.plan_id,
        plan_name:         p.plan_name,
        plan_coins:        p.plan_coins,
        plan_price:        Number(p.plan_price),
        purchases:         Number(p.purchases),
        unique_buyers:     Number(p.unique_buyers),
        coins_sold:        coinsSold,
        coins_consumed:    coinsConsumed,
        coins_remaining:   coinsRemaining,
        usage_pct:         usagePct,
        avg_coins_per_user: avgPerUser,
        still_active:      Number(p.still_active),
        last_30d: {
          purchases: Number(p.last_30d_purchases),
          revenue:   Number(p.last_30d_revenue).toFixed(2),
        },
        total_revenue: Number(p.revenue).toFixed(2),
      };
    });

    /* ── 6. Currency breakdown grouped by plan ── */
    const currencyMap = {};
    for (const row of currencyRevenue) {
      if (!currencyMap[row.plan_id]) {
        currencyMap[row.plan_id] = {
          plan_name:  row.plan_name,
          plan_coins: row.plan_coins,
          currencies: {},
        };
      }
      currencyMap[row.plan_id].currencies[row.currency] = {
        buyers:  Number(row.buyers),
        revenue: Number(row.revenue).toFixed(2),
      };
    }

    const totalCoins    = Number(overall.total_coins_sold);
    const totalConsumed = Number(consumed.total_consumed);

    return res.status(200).json({
      success: true,

      summary: {
        unique_buyers:    Number(overall.unique_buyers),
        total_purchases:  Number(overall.total_purchases),
        total_coins_sold: totalCoins,
        coins_consumed:   totalConsumed,
        coins_remaining:  totalCoins - totalConsumed,
        usage_pct:        totalCoins > 0
          ? ((totalConsumed / totalCoins) * 100).toFixed(1)
          : "0.0",
        total_revenue:    Number(overall.total_revenue).toFixed(2),
      },

      plan_performance: formattedPlans,

      revenue_by_currency: Object.values(currencyMap),

      recent_purchases: recentPurchases.map((r) => ({
        user_id:         r.user_id,
        user_name:       r.user_name,
        user_email:      r.user_email,
        country:         r.country,
        plan_name:       r.plan_name,
        plan_coins:      r.plan_coins,
        amount:          Number(r.amount).toFixed(2),
        currency:        r.currency,
        purchased_at:    r.purchased_at,
        coins_used:      Number(r.coins_used),
        coins_remaining: Number(r.coins_remaining),
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

 export const getActivityDormancyReport = async (req, res) => {
  try {

    /* ── 1. DAU — today ── */
    const [[dau]] = await db.execute(
      `SELECT COUNT(DISTINCT user_id) AS total
       FROM match_generation_log
       WHERE DATE(created_at) = CURDATE()`
    );

    /* ── 2. WAU — last 7 days ── */
    const [[wau]] = await db.execute(
      `SELECT COUNT(DISTINCT user_id) AS total
       FROM match_generation_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    /* ── 3. MAU — last 30 days ── */
    const [[mau]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       WHERE u.account_status != 'deleted'
         AND u.email_verify = 1
         AND u.mobile_verify = 1
         AND (
           EXISTS (
             SELECT 1 FROM match_generation_log m
             WHERE m.user_id    = u.id
               AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           ) OR EXISTS (
             SELECT 1 FROM coins_transactions ct
             WHERE ct.user_id    = u.id
               AND ct.coins      > 0
               AND ct.status     = 'success'
               AND ct.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           )
         )`
    );

    /* ── 4. Dormant 30+ ── */
    const [[dormant30]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       WHERE u.account_status != 'deleted'
         AND u.email_verify  = 1
         AND u.mobile_verify = 1
         AND NOT EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         )
         AND NOT EXISTS (
           SELECT 1 FROM coins_transactions ct
           WHERE ct.user_id    = u.id
             AND ct.coins      > 0
             AND ct.status     = 'success'
             AND ct.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         )`
    );

    /* ── 5. Total verified ── */
    const [[verified]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE account_status != 'deleted'
         AND email_verify  = 1
         AND mobile_verify = 1`
    );

    const totalVerified = Number(verified.total);

    /* ── 6. Dormancy buckets ── */
    const [[bucket_30_60]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       WHERE u.account_status != 'deleted'
         AND u.email_verify  = 1
         AND u.mobile_verify = 1
         AND NOT EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         )
         AND EXISTS (
           SELECT 1 FROM match_generation_log m2
           WHERE m2.user_id    = u.id
             AND m2.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
             AND m2.created_at <  DATE_SUB(NOW(), INTERVAL 30 DAY)
         )`
    );

    const [[bucket_60_90]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       WHERE u.account_status != 'deleted'
         AND u.email_verify  = 1
         AND u.mobile_verify = 1
         AND NOT EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
         )
         AND EXISTS (
           SELECT 1 FROM match_generation_log m2
           WHERE m2.user_id    = u.id
             AND m2.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
             AND m2.created_at <  DATE_SUB(NOW(), INTERVAL 60 DAY)
         )`
    );

    const [[bucket_90_plus]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       WHERE u.account_status != 'deleted'
         AND u.email_verify  = 1
         AND u.mobile_verify = 1
         AND NOT EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         )`
    );

    /* ── 7. Re-engagement segments ── */

    /* HIGH — Past buyers with unused coins */
    const [[seg_unused_coins]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       JOIN user_coins uc ON uc.user_id = u.id
       WHERE u.account_status != 'deleted'
         AND uc.available_coins > 0
         AND EXISTS (
           SELECT 1 FROM coins_transactions ct
           WHERE ct.user_id = u.id
             AND ct.coins   > 0
             AND ct.status  = 'success'
         )
         AND NOT EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         )`
    );

    /* HIGH — Free UCT eligible, not claimed (verified, never used free trial, within 14 days) */
    const [[seg_free_eligible]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       WHERE u.account_status != 'deleted'
         AND u.email_verify   = 1
         AND u.mobile_verify  = 1
         AND u.free_trial_used = 0
         AND u.created_at    >= DATE_SUB(NOW(), INTERVAL 14 DAY)`
    );

    /* MEDIUM — Claimed free UCT only, never paid */
    const [[seg_free_only]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       WHERE u.account_status != 'deleted'
         AND u.free_trial_used = 1
         AND NOT EXISTS (
           SELECT 1 FROM coins_transactions ct
           WHERE ct.user_id = u.id
             AND ct.coins   > 0
             AND ct.status  = 'success'
         )`
    );

    /* LOW — 90+ days dormant, no purchase history */
    const [[seg_lost]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       WHERE u.account_status != 'deleted'
         AND u.email_verify  = 1
         AND u.mobile_verify = 1
         AND NOT EXISTS (
           SELECT 1 FROM coins_transactions ct
           WHERE ct.user_id = u.id
             AND ct.coins   > 0
             AND ct.status  = 'success'
         )
         AND NOT EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         )`
    );

    /* ── 8. 90+ dormant cohort preview — top 12 ── */
    const [dormantCohort] = await db.execute(
      `SELECT
         u.id,
         u.fullname,
         u.email,
         u.country,
         u.created_at                              AS verified_at,
         MAX(m.created_at)                         AS last_activity,
         DATEDIFF(NOW(), MAX(m.created_at))        AS days_dormant,
         COALESCE(SUM(CASE WHEN ct.coins > 0 THEN ct.amount ELSE 0 END), 0) AS lifetime_spend,
         COUNT(DISTINCT CASE WHEN ct.coins > 0 THEN ct.plan_id END) AS packs_bought
       FROM users u
       LEFT JOIN match_generation_log m  ON m.user_id  = u.id
       LEFT JOIN coins_transactions   ct ON ct.user_id = u.id AND ct.status = 'success'
       WHERE u.account_status != 'deleted'
         AND u.email_verify   = 1
         AND u.mobile_verify  = 1
         AND NOT EXISTS (
           SELECT 1 FROM match_generation_log m2
           WHERE m2.user_id    = u.id
             AND m2.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
         )
       GROUP BY u.id, u.fullname, u.email, u.country, u.created_at
       HAVING last_activity IS NOT NULL
       ORDER BY days_dormant DESC
       LIMIT 12`
    );

    return res.status(200).json({
      success: true,

      overview: {
        dau: {
          count:      Number(dau.total),
          percentage: totalVerified > 0
            ? ((Number(dau.total) / totalVerified) * 100).toFixed(1) : "0.0",
        },
        wau: {
          count:      Number(wau.total),
          percentage: totalVerified > 0
            ? ((Number(wau.total) / totalVerified) * 100).toFixed(1) : "0.0",
        },
        mau: {
          count:      Number(mau.total),
          percentage: totalVerified > 0
            ? ((Number(mau.total) / totalVerified) * 100).toFixed(1) : "0.0",
        },
        dormant_30d: {
          count:      Number(dormant30.total),
          percentage: totalVerified > 0
            ? ((Number(dormant30.total) / totalVerified) * 100).toFixed(1) : "0.0",
        },
      },

      dormancy_buckets: {
        total_verified: totalVerified,
        active_30d: {
          count:      Number(mau.total),
          percentage: totalVerified > 0
            ? ((Number(mau.total) / totalVerified) * 100).toFixed(1) : "0.0",
        },
        dormant_30_60d: {
          count:      Number(bucket_30_60.total),
          percentage: totalVerified > 0
            ? ((Number(bucket_30_60.total) / totalVerified) * 100).toFixed(1) : "0.0",
        },
        dormant_60_90d: {
          count:      Number(bucket_60_90.total),
          percentage: totalVerified > 0
            ? ((Number(bucket_60_90.total) / totalVerified) * 100).toFixed(1) : "0.0",
        },
        dormant_90d_plus: {
          count:      Number(bucket_90_plus.total),
          percentage: totalVerified > 0
            ? ((Number(bucket_90_plus.total) / totalVerified) * 100).toFixed(1) : "0.0",
        },
      },

      reengagement_segments: [
        {
          priority:    "HIGH",
          key:         "past_buyers_unused_coins",
          title:       "Past buyers with unused coins",
          description: "Bought a pack, used some, then went dormant. Coins still in wallet.",
          count:       Number(seg_unused_coins.total),
          action:      "Send you have X coins left email",
        },
        {
          priority:    "HIGH",
          key:         "free_uct_eligible",
          title:       "Free UCT eligible, not claimed",
          description: "Verified, never claimed free UCT, within 14-day window.",
          count:       Number(seg_free_eligible.total),
          action:      "Send free UCT reminder",
        },
        {
          priority:    "MEDIUM",
          key:         "free_only_never_paid",
          title:       "Claimed free UCT only, never paid",
          description: "Tried the free UCT but did not convert.",
          count:       Number(seg_free_only.total),
          action:      "Send Starter pack offer",
        },
        {
          priority:    "LOW",
          key:         "90d_no_purchase",
          title:       "90+ days dormant, no purchase history",
          description: "Verified long ago, never claimed free, never bought. Likely lost.",
          count:       Number(seg_lost.total),
          action:      "Mark for offboarding",
        },
      ],

      dormant_90d_cohort: {
        total:   Number(bucket_90_plus.total),
        preview: dormantCohort.map((u) => ({
          user_id:       u.id,
          fullname:      u.fullname,
          email:         u.email,
          country:       u.country,
          verified_at:   u.verified_at,
          last_activity: u.last_activity,
          days_dormant:  u.days_dormant,
          lifetime_spend: Number(u.lifetime_spend).toFixed(2),
          packs_bought:  Number(u.packs_bought),
          action:        Number(u.lifetime_spend) > 0 ? "Win-back" : "Suppress",
        })),
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

 export const getDirectoryReport = async (req, res) => {
  try {
    const {
      page     = 1,
      limit    = 10,
      search   = "",
      country  = "",
      plan     = "",
      status   = "",
      activity = "",
    } = req.query;

    const limitNum  = Number(limit);
    const offsetNum = (Number(page) - 1) * limitNum;

    /* ── Build WHERE ── */
    const conditions = [];
    const params     = [];

    /* search */
    if (search) {
      conditions.push(`(u.fullname LIKE ? OR u.email LIKE ? OR u.mobile LIKE ? OR CAST(u.id AS CHAR) LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    /* country */
    if (country) {
      conditions.push(`u.country = ?`);
      params.push(country);
    }

    /* plan */
    if (plan === "none") {
      conditions.push(`us.id IS NULL`);
    } else if (plan) {
      conditions.push(`sp.name LIKE ?`);
      params.push(`%${plan}%`);
    }

    /* status */
    if (status === "active") {
      conditions.push(
        `CAST(u.account_status AS CHAR) = 'active'
         AND u.email_verify  = 1
         AND u.mobile_verify = 1`
      );
    } else if (status === "pending") {
      conditions.push(
        `CAST(u.account_status AS CHAR) = 'active'
         AND (u.email_verify = 0 OR u.mobile_verify = 0)`
      );
    } else if (status === "banned") {
      conditions.push(`CAST(u.account_status AS CHAR) = 'banned'`);
    } else if (status === "deleted") {
      conditions.push(`CAST(u.account_status AS CHAR) = 'deleted'`);
    }

    /* activity */
    if (activity === "active_7d") {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         )`
      );
    } else if (activity === "active_30d") {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         )`
      );
    } else if (activity === "dormant_60d") {
      conditions.push(
        `NOT EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id    = u.id
             AND m.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
         )`
      );
    } else if (activity === "never") {
      conditions.push(
        `NOT EXISTS (
           SELECT 1 FROM match_generation_log m
           WHERE m.user_id = u.id
         )`
      );
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    /* ── Main query ── */
    const [users] = await db.execute(
      `SELECT
         u.id,
         u.fullname,
         u.email,
         u.mobile,
         u.country,
         u.account_status,
         u.email_verify,
         u.mobile_verify,
         u.created_at,

         sp.name        AS plan_name,
         sp.coins       AS plan_coins,
         us.status      AS subscription_status,
         us.expiry_date AS subscription_expiry,

         COUNT(DISTINCT mgl.id)                                              AS total_ucts,
         COALESCE(SUM(CASE WHEN ct.coins > 0 THEN ct.amount ELSE 0 END), 0) AS lifetime_spend,

         CASE
           WHEN CAST(u.account_status AS CHAR) = 'deleted' THEN 'deleted'
           WHEN CAST(u.account_status AS CHAR) = 'banned'  THEN 'banned'
           WHEN CAST(u.account_status AS CHAR) = 'active'
             AND (u.email_verify = 0 OR u.mobile_verify = 0) THEN 'pending'
           WHEN NOT EXISTS (
             SELECT 1 FROM match_generation_log m2
             WHERE m2.user_id    = u.id
               AND m2.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           ) THEN 'dormant'
           ELSE 'active'
         END AS activity_status

       FROM users u

       LEFT JOIN (
         SELECT us1.*
         FROM user_subscriptions us1
         INNER JOIN (
           SELECT user_id, MAX(id) AS max_id
           FROM user_subscriptions
           WHERE status = 'active' AND expiry_date > NOW()
           GROUP BY user_id
         ) us2 ON us2.user_id = us1.user_id AND us2.max_id = us1.id
       ) us ON us.user_id = u.id

       LEFT JOIN subscription_plans   sp  ON sp.id      = us.plan_id
       LEFT JOIN match_generation_log mgl ON mgl.user_id = u.id
       LEFT JOIN coins_transactions   ct  ON ct.user_id  = u.id AND ct.status = 'success'

       ${whereClause}

       GROUP BY
         u.id, u.fullname, u.email, u.mobile, u.country,
         u.account_status, u.email_verify, u.mobile_verify, u.created_at,
         sp.name, sp.coins, us.status, us.expiry_date
       ORDER BY u.id DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    /* ── Total count ── */
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       LEFT JOIN (
         SELECT us1.*
         FROM user_subscriptions us1
         INNER JOIN (
           SELECT user_id, MAX(id) AS max_id
           FROM user_subscriptions
           WHERE status = 'active' AND expiry_date > NOW()
           GROUP BY user_id
         ) us2 ON us2.user_id = us1.user_id AND us2.max_id = us1.id
       ) us ON us.user_id = u.id
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       ${whereClause}`,
      params
    );

    return res.status(200).json({
      success: true,
      pagination: {
        total:       Number(total),
        page:        Number(page),
        limit:       limitNum,
        total_pages: Math.ceil(Number(total) / limitNum),
      },
      filters: { search, country, plan, status, activity },
      data: users.map((u) => ({
        id:              u.id,
        fullname:        u.account_status === "deleted" ? "Anonymized" : u.fullname,
        email:           u.account_status === "deleted" ? null : u.email,
        mobile:          u.account_status === "deleted" ? null : u.mobile,
        country:         u.country,
        joined:          u.created_at,
        account_status:  u.account_status,
        activity_status: u.activity_status,
        plan: u.plan_name
          ? { name: u.plan_name, coins: u.plan_coins }
          : null,
        total_ucts:      Number(u.total_ucts),
        lifetime_spend:  Number(u.lifetime_spend).toFixed(2),
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= MATCHES — LIVE ================= */
export const getLiveMatches = async (req, res) => {
  try {
    const [liveMatches] = await db.execute(
      `SELECT
         m.id,
         m.provider_match_id,
         m.hometeamname,
         m.awayteamname,
         m.start_time,
         m.status,
         m.lineup_status,
         m.lineupavailable,
         s.name AS series_name,
         COUNT(DISTINCT mgl.user_id) AS unique_users,
         COUNT(DISTINCT mgl.id)      AS total_ucts,
         ROUND(
           COUNT(DISTINCT mgl.id) /
           GREATEST(TIMESTAMPDIFF(MINUTE, MIN(mgl.created_at), NOW()), 1),
           1
         ) AS ucts_per_min
       FROM matches m
       LEFT JOIN series s               ON s.seriesid         = m.series_id
       LEFT JOIN match_generation_log mgl ON mgl.match_id = m.id
       WHERE m.status          = 'UPCOMING'
         AND m.lineupavailable = 1
         AND m.lineup_status   = 'confirmed'
         AND m.is_active       = 1
       GROUP BY
         m.id, m.provider_match_id, m.hometeamname, m.awayteamname,
         m.start_time, m.status, m.lineup_status, m.lineupavailable, s.name
       ORDER BY m.start_time ASC`
    );

    const [activityFeed] = await db.execute(
      `SELECT
         mgl.id,
         mgl.user_id,
         mgl.match_id,
         mgl.total_teams,
         mgl.created_at,
         u.fullname,
         u.country,
         m.hometeamname,
         m.awayteamname,
         us.plan_name
       FROM match_generation_log mgl
       JOIN users   u ON u.id = mgl.user_id
       JOIN matches m ON m.id = mgl.match_id
       LEFT JOIN (
         SELECT us1.user_id, sp.name AS plan_name
         FROM user_subscriptions us1
         JOIN subscription_plans sp ON sp.id = us1.plan_id
         INNER JOIN (
           SELECT user_id, MAX(id) AS max_id
           FROM user_subscriptions
           WHERE status = 'active' AND expiry_date > NOW()
           GROUP BY user_id
         ) us2 ON us2.user_id = us1.user_id AND us2.max_id = us1.id
       ) us ON us.user_id = mgl.user_id
       WHERE mgl.created_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
       ORDER BY mgl.created_at DESC
       LIMIT 20`
    );

    return res.status(200).json({
      success:    true,
      total_live: liveMatches.length,
      matches: liveMatches.map((m) => ({
        id:              m.id,
        home_team:       m.hometeamname,
        away_team:       m.awayteamname,
        series:          m.series_name,
        start_time:      m.start_time,
        kickoff_in_mins: Math.max(0, Math.round(
          (new Date(m.start_time) - new Date()) / (1000 * 60)
        )),
        lineup_status:   m.lineup_status,
        total_ucts:      Number(m.total_ucts),
        unique_users:    Number(m.unique_users),
        ucts_per_min:    Number(m.ucts_per_min),
      })),
      activity_feed: activityFeed.map((a) => ({
        id:          a.id,
        user_id:     a.user_id,
        fullname:    a.fullname,
        country:     a.country,
        match:       `${a.hometeamname} v ${a.awayteamname}`,
        total_teams: a.total_teams,
        plan_name:   a.plan_name,
        is_free:     !a.plan_name,
        seconds_ago: Math.round((new Date() - new Date(a.created_at)) / 1000),
        created_at:  a.created_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= MATCHES — UPCOMING ================= */
export const getUpcomingMatches = async (req, res) => {
  try {
    const [matches] = await db.execute(
      `SELECT
         m.id,
         m.hometeamname,
         m.awayteamname,
         m.start_time,
         m.lineup_status,
         m.lineupavailable,
         s.id   AS series_id,
         s.name AS series_name,
         COUNT(DISTINCT mgl.user_id) AS registrations
       FROM matches m
       LEFT JOIN series s ON s.seriesid = m.series_id
       LEFT JOIN match_generation_log mgl ON mgl.match_id = m.id
       WHERE m.status    = 'UPCOMING'
         AND m.is_active = 1
       GROUP BY
         m.id, m.hometeamname, m.awayteamname,
         m.start_time, m.lineup_status, m.lineupavailable,
         s.id, s.name
       ORDER BY m.start_time ASC`
    );

    /* group by series */
    const seriesMap = {};
    for (const m of matches) {
      const key = m.series_id || "other";
      if (!seriesMap[key]) {
        seriesMap[key] = {
           series_id:   m.series_id,
         series_name: m.series_name || "Unknown Series",
          matches:     [],
        };
      }
      seriesMap[key].matches.push({
        id:              m.id,
        home_team:       m.hometeamname,
        away_team:       m.awayteamname,
        start_time:      m.start_time,
        lineup_status:   m.lineup_status,
        lineupavailable: Boolean(m.lineupavailable),
        registrations:   Number(m.registrations),
      });
    }

    return res.status(200).json({
      success:      true,
      total:        matches.length,
      by_series:    Object.values(seriesMap),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= MATCHES — PAST ================= */
export const getPastMatches = async (req, res) => {
  try {
    const { page = 1, limit = 20, days = 14 } = req.query;
    const limitNum  = Number(limit);
    const offsetNum = (Number(page) - 1) * limitNum;
    const daysNum   = Number(days);

    /* ── Summary ── */
    const [[summary]] = await db.execute(
      `SELECT
         COUNT(DISTINCT mgl.id)       AS total_ucts,
         COUNT(DISTINCT mgl.user_id)  AS unique_participants,
         COALESCE(SUM(ct.amount), 0)  AS revenue
       FROM matches m
       LEFT JOIN match_generation_log mgl ON mgl.match_id  = m.id
       LEFT JOIN coins_transactions   ct  ON ct.user_id    = mgl.user_id
         AND ct.coins > 0 AND ct.status = 'success'
       WHERE m.status    = 'RESULT'
         AND m.is_active = 1
         AND m.start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [daysNum]
    );

    /* ── Match list ── */
    const [matches] = await db.execute(
      `SELECT
         m.id,
         m.hometeamname,
         m.awayteamname,
         m.start_time,
         m.status,
         s.name                      AS series_name,
         COUNT(DISTINCT mgl.id)      AS total_ucts,
         COUNT(DISTINCT mgl.user_id) AS unique_users,
         ROUND(
           COUNT(DISTINCT mgl.id) /
           GREATEST(COUNT(DISTINCT mgl.user_id), 1),
           2
         )                           AS avg_per_user,
         SUM(CASE WHEN u.free_trial_used = 1
           AND NOT EXISTS (
             SELECT 1 FROM coins_transactions ct2
             WHERE ct2.user_id = mgl.user_id
               AND ct2.coins   > 0
               AND ct2.status  = 'success'
           ) THEN 1 ELSE 0 END)      AS free_ucts
       FROM matches m
       LEFT JOIN series s               ON s.seriesid          = m.series_id
       LEFT JOIN match_generation_log mgl ON mgl.match_id = m.id
       LEFT JOIN users u                ON u.id          = mgl.user_id
       WHERE m.status    = 'RESULT'
         AND m.is_active = 1
         AND m.start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY m.id, m.hometeamname, m.awayteamname, m.start_time, m.status, s.name
       ORDER BY total_ucts DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      [daysNum]
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM matches
       WHERE status = 'RESULT'
         AND is_active = 1
         AND start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [daysNum]
    );

    const totalUcts        = Number(summary.total_ucts);
    const uniqueParticipants = Number(summary.unique_participants);

    return res.status(200).json({
      success: true,
      summary: {
        total_ucts:           totalUcts,
        unique_participants:  uniqueParticipants,
        avg_ucts_per_user:    uniqueParticipants > 0
          ? (totalUcts / uniqueParticipants).toFixed(2)
          : "0.00",
        revenue:              Number(summary.revenue).toFixed(2),
      },
      pagination: {
        total:       Number(total),
        page:        Number(page),
        limit:       limitNum,
        total_pages: Math.ceil(Number(total) / limitNum),
      },
      matches: matches.map((m) => ({
        id:           m.id,
        home_team:    m.hometeamname,
        away_team:    m.awayteamname,
        series:       m.series_name,
        start_time:   m.start_time,
        total_ucts:   Number(m.total_ucts),
        unique_users: Number(m.unique_users),
        avg_per_user: Number(m.avg_per_user),
        free_ucts:    Number(m.free_ucts),
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= MATCHES — BY LEAGUE ================= */
export const getLeagueMatches = async (req, res) => {
  try {
    const [leagues] = await db.execute(
      `SELECT
         s.id,
         s.name                       AS series_name,
         COUNT(DISTINCT m.id)         AS total_matches,
         COUNT(DISTINCT CASE WHEN m.status = 'UPCOMING' THEN m.id END) AS upcoming,
         COUNT(DISTINCT CASE WHEN m.status = 'LIVE'     THEN m.id END) AS live,
         COUNT(DISTINCT CASE WHEN m.status = 'RESULT'   THEN m.id END) AS completed,
         COUNT(DISTINCT mgl.user_id)  AS unique_users,
         COUNT(DISTINCT mgl.id)       AS total_ucts
       FROM series s
       LEFT JOIN matches m               ON m.series_id  = s.id AND m.is_active = 1
       LEFT JOIN match_generation_log mgl ON mgl.match_id = m.id
       GROUP BY s.id, s.name
       ORDER BY total_ucts DESC`
    );

    const grandTotal = leagues.reduce(
      (acc, l) => {
        acc.total_matches += Number(l.total_matches);
        acc.unique_users  += Number(l.unique_users);
        acc.total_ucts    += Number(l.total_ucts);
        return acc;
      },
      { total_matches: 0, unique_users: 0, total_ucts: 0 }
    );

    return res.status(200).json({
      success:      true,
      total_leagues: leagues.length,
      totals:        grandTotal,
      leagues: leagues.map((l) => ({
        series_id:     l.id,
        series_name:   l.series_name,
        total_matches: Number(l.total_matches),
        upcoming:      Number(l.upcoming),
        live:          Number(l.live),
        completed:     Number(l.completed),
        unique_users:  Number(l.unique_users),
        total_ucts:    Number(l.total_ucts),
        pct_of_total:  grandTotal.total_ucts > 0
          ? ((Number(l.total_ucts) / grandTotal.total_ucts) * 100).toFixed(1)
          : "0.0",
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};