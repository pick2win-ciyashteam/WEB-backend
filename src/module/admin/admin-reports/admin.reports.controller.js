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



// export const getMatchDashboardReport = async (req, res) => {
//   try {
//     const { match_id, window_mins = 60, days = 30 } = req.query;
//     if (!match_id) return res.status(400).json({ success: false, message: "match_id required" });

//     const windowNum = Number(window_mins);
//     const daysNum = Number(days);

//     /* ════════════════════════════════
//        MATCH INFO
//     ════════════════════════════════ */
//     const [[match]] = await db.execute(
//       `SELECT m.id, m.hometeamname, m.awayteamname, m.start_time, m.status,
//               s.name AS series_name
//        FROM matches m
//        LEFT JOIN series s ON s.seriesid = m.series_id
//        WHERE m.id = ?`,
//       [match_id]
//     );

//     /* ════════════════════════════════
//        TAB 1 — MATCH ACTIVITY (KPIs)
//     ════════════════════════════════ */
//     const [[kpi]] = await db.execute(
//       `SELECT
//          COUNT(DISTINCT mgl.user_id)                               AS total_users,
//          COUNT(DISTINCT mgl.id)                                    AS total_ucts,
//          ROUND(AVG(mgl.generation_time_ms) / 1000, 1)             AS avg_gen_time_sec,
//          SUM(CASE WHEN mgl.status = 'success' THEN 1 ELSE 0 END)  AS success_count,
//          COUNT(mgl.id)                                             AS total_requests,
//          MIN(mgl.created_at)                                       AS first_uct_at
//        FROM match_generation_log mgl
//        WHERE mgl.match_id = ?`,
//       [match_id]
//     );

//     /* Generation time percentiles */
//     const [genTimes] = await db.execute(
//       `SELECT generation_time_ms FROM match_generation_log
//        WHERE match_id = ? AND generation_time_ms IS NOT NULL
//        ORDER BY generation_time_ms ASC`,
//       [match_id]
//     );
//     const times = genTimes.map((r) => r.generation_time_ms / 1000);
//     const pct = (arr, p) => {
//       if (!arr.length) return 0;
//       const idx = Math.ceil((p / 100) * arr.length) - 1;
//       return Number(arr[Math.max(0, idx)].toFixed(1));
//     };
//     const mean = times.length
//       ? Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(1))
//       : 0;

//     /* Pack tier breakdown */
//     const [packTiers] = await db.execute(
//       `SELECT
//          COALESCE(sp.name, 'Free') AS tier,
//          COUNT(DISTINCT mgl.user_id) AS users,
//          COUNT(DISTINCT mgl.id)      AS ucts
//        FROM match_generation_log mgl
//        LEFT JOIN (
//          SELECT us1.user_id, sp.name
//          FROM user_subscriptions us1
//          JOIN subscription_plans sp ON sp.id = us1.plan_id
//          INNER JOIN (
//            SELECT user_id, MAX(id) AS max_id
//            FROM user_subscriptions
//            WHERE status = 'active' AND expiry_date > NOW()
//            GROUP BY user_id
//          ) us2 ON us2.user_id = us1.user_id AND us2.max_id = us1.id
//        ) sp ON sp.user_id = mgl.user_id
//        WHERE mgl.match_id = ?
//        GROUP BY COALESCE(sp.name, 'Free')
//        ORDER BY ucts DESC`,
//       [match_id]
//     );

//     /* Time-series (10-min buckets) */
//     const [timeSeries] = await db.execute(
//       `SELECT
//          DATE_FORMAT(
//            DATE_SUB(mgl.created_at, INTERVAL MOD(MINUTE(mgl.created_at), 10) MINUTE),
//            '%Y-%m-%d %H:%i'
//          )                            AS bucket,
//          COUNT(DISTINCT mgl.user_id) AS users,
//          COUNT(DISTINCT mgl.id)      AS ucts
//        FROM match_generation_log mgl
//        WHERE mgl.match_id = ?
//        GROUP BY bucket
//        ORDER BY bucket ASC`,
//       [match_id]
//     );

//     const peakMinsBeforeKickoff = kpi.first_uct_at && match?.start_time
//       ? Math.round((new Date(match.start_time) - new Date(kpi.first_uct_at)) / (1000 * 60))
//       : null;

//     /* ════════════════════════════════
//        TAB 2 — LIVE STREAM (last 60s)
//     ════════════════════════════════ */
//     const [[rolling]] = await db.execute(
//       `SELECT
//          COUNT(DISTINCT mgl.user_id)                        AS active_users,
//          COUNT(DISTINCT mgl.id)                             AS ucts_last_60s,
//          ROUND(AVG(mgl.generation_time_ms) / 1000, 2)      AS avg_gen_sec
//        FROM match_generation_log mgl
//        WHERE mgl.match_id   = ?
//          AND mgl.created_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)`,
//       [match_id]
//     );

//     const [liveFeed] = await db.execute(
//       `SELECT
//          mgl.id, mgl.user_id, mgl.total_teams,
//          mgl.generation_time_ms, mgl.status, mgl.created_at,
//          u.fullname, u.country,
//          COALESCE(sp.name, 'Free') AS plan_name
//        FROM match_generation_log mgl
//        JOIN users u ON u.id = mgl.user_id
//        LEFT JOIN (
//          SELECT us1.user_id, sp.name
//          FROM user_subscriptions us1
//          JOIN subscription_plans sp ON sp.id = us1.plan_id
//          INNER JOIN (
//            SELECT user_id, MAX(id) AS max_id
//            FROM user_subscriptions
//            WHERE status = 'active' AND expiry_date > NOW()
//            GROUP BY user_id
//          ) us2 ON us2.user_id = us1.user_id AND us2.max_id = us1.id
//        ) sp ON sp.user_id = mgl.user_id
//        WHERE mgl.match_id   = ?
//          AND mgl.created_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
//        ORDER BY mgl.created_at DESC
//        LIMIT 50`,
//       [match_id]
//     );

//     /* ════════════════════════════════
//        TAB 3 — PEAK ANALYSIS
//     ════════════════════════════════ */
//     const [perMinute] = await db.execute(
//       `SELECT
//          DATE_FORMAT(mgl.created_at, '%Y-%m-%d %H:%i')      AS minute_bucket,
//          COUNT(DISTINCT mgl.user_id)                         AS users,
//          COUNT(DISTINCT mgl.id)                              AS ucts,
//          ROUND(AVG(mgl.generation_time_ms) / 1000, 2)       AS avg_gen_sec
//        FROM match_generation_log mgl
//        WHERE mgl.match_id   = ?
//          AND mgl.created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
//        GROUP BY minute_bucket
//        ORDER BY minute_bucket ASC`,
//       [match_id, windowNum]
//     );

//     const peakMinute = perMinute.reduce(
//       (max, r) => (Number(r.ucts) > Number(max.ucts || 0) ? r : max),
//       {}
//     );

//     const [byCountry] = await db.execute(
//       `SELECT
//          u.country,
//          COUNT(DISTINCT mgl.user_id) AS users,
//          COUNT(DISTINCT mgl.id)      AS ucts
//        FROM match_generation_log mgl
//        JOIN users u ON u.id = mgl.user_id
//        WHERE mgl.match_id   = ?
//          AND mgl.created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
//        GROUP BY u.country
//        ORDER BY ucts DESC
//        LIMIT 10`,
//       [match_id, windowNum]
//     );

//     /* ════════════════════════════════
//        TAB 4 — ENGINE PERFORMANCE
//     ════════════════════════════════ */
//     const [[funnel]] = await db.execute(
//       `SELECT
//          COUNT(*)                                                                   AS total_requests,
//          SUM(CASE WHEN attempt_number = 1 AND status = 'success' THEN 1 ELSE 0 END) AS first_try_success,
//          SUM(CASE WHEN attempt_number = 1 AND status = 'failed'  THEN 1 ELSE 0 END) AS first_try_failed,
//          SUM(CASE WHEN attempt_number = 2                         THEN 1 ELSE 0 END) AS retriggers,
//          SUM(CASE WHEN attempt_number = 2 AND status = 'success' THEN 1 ELSE 0 END) AS retry_success,
//          SUM(CASE WHEN attempt_number = 2 AND status = 'failed'  THEN 1 ELSE 0 END) AS retry_failed,
//          SUM(CASE WHEN attempt_number >= 3 AND status = 'success' THEN 1 ELSE 0 END) AS second_retry_success
//        FROM match_generation_log
//        WHERE match_id = ?`,
//       [match_id]
//     );

//     const [failures] = await db.execute(
//       `SELECT
//          COALESCE(failure_reason, 'unknown')   AS failure_reason,
//          failure_description,
//          SUM(CASE WHEN attempt_number = 1 THEN 1 ELSE 0 END) AS first_try_fails,
//          SUM(CASE WHEN attempt_number = 2 THEN 1 ELSE 0 END) AS retry_fails,
//          COUNT(*)                                              AS total
//        FROM match_generation_log
//        WHERE match_id = ? AND status = 'failed'
//        GROUP BY failure_reason, failure_description
//        ORDER BY total DESC`,
//       [match_id]
//     );

//     const totalFailed = failures.reduce((s, r) => s + Number(r.total), 0);
//     const uniqueUsersGotUct = Number(funnel.first_try_success) + Number(funnel.retry_success) + Number(funnel.second_retry_success);

//     const funnelSteps = [
//       { label: "All requests submitted", count: Number(funnel.total_requests), pct: "100%", type: "total" },
//       { label: "Succeed on first attempt", count: Number(funnel.first_try_success), pct: funnel.total_requests > 0 ? `${((funnel.first_try_success / funnel.total_requests) * 100).toFixed(1)}%` : "0%", type: "success" },
//       { label: "Fail on first attempt · auto-retry kicks in within 2s", count: Number(funnel.first_try_failed), pct: funnel.total_requests > 0 ? `${((funnel.first_try_failed / funnel.total_requests) * 100).toFixed(1)}%` : "0%", type: "fail" },
//       { label: "Succeed on first retry", count: Number(funnel.retry_success), pct: funnel.retriggers > 0 ? `${((funnel.retry_success / funnel.retriggers) * 100).toFixed(1)}%` : "0%", type: "success" },
//       { label: "Fail on first retry · second retry triggers", count: Number(funnel.retry_failed), pct: funnel.retriggers > 0 ? `${((funnel.retry_failed / funnel.retriggers) * 100).toFixed(1)}%` : "0%", type: "fail" },
//       { label: "Succeed on second retry", count: Number(funnel.second_retry_success), pct: funnel.retry_failed > 0 ? `${((funnel.second_retry_success / funnel.retry_failed) * 100).toFixed(1)}%` : "0%", type: "success" },
//     ];

//     /* ════════════════════════════════
//        TAB 5 — CAPACITY PLANNING
//     ════════════════════════════════ */
//     const [peakLoads] = await db.execute(
//       `SELECT
//          mgl.match_id,
//          m.hometeamname, m.awayteamname, m.start_time,
//          COUNT(DISTINCT mgl.id) AS total_ucts,
//          MAX(per_min.cnt)       AS peak_per_min
//        FROM match_generation_log mgl
//        JOIN matches m ON m.id = mgl.match_id
//        JOIN (
//          SELECT match_id,
//            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS bucket,
//            COUNT(*) AS cnt
//          FROM match_generation_log
//          WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
//          GROUP BY match_id, bucket
//        ) per_min ON per_min.match_id = mgl.match_id
//        WHERE mgl.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
//        GROUP BY mgl.match_id, m.hometeamname, m.awayteamname, m.start_time
//        ORDER BY peak_per_min DESC
//        LIMIT 20`
//     );

//     const [hourlyLoad] = await db.execute(
//       `SELECT
//          DATE_FORMAT(created_at, '%Y-%m-%d %H:00') AS hour_bucket,
//          COUNT(*)                                   AS requests,
//          COUNT(DISTINCT user_id)                    AS users
//        FROM match_generation_log
//        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
//        GROUP BY hour_bucket
//        ORDER BY hour_bucket ASC`
//     );

//     /* ════════════════════════════════
//        TAB 6 — MATCH HISTORY
//     ════════════════════════════════ */
//     const [matchHistory] = await db.execute(
//       `SELECT
//          m.id, m.hometeamname, m.awayteamname, m.start_time, m.status,
//          s.name                                                AS series_name,
//          COUNT(DISTINCT mgl.user_id)                          AS unique_users,
//          COUNT(DISTINCT mgl.id)                               AS total_ucts,
//          ROUND(AVG(mgl.generation_time_ms) / 1000, 2)        AS avg_gen_sec,
//          SUM(CASE WHEN mgl.status = 'failed'  THEN 1 ELSE 0 END) AS failed_ucts,
//          SUM(CASE WHEN mgl.status = 'success' THEN 1 ELSE 0 END) AS success_ucts
//        FROM matches m
//        LEFT JOIN series s                ON s.seriesid    = m.series_id
//        LEFT JOIN match_generation_log mgl ON mgl.match_id  = m.id
//        WHERE m.is_active   = 1
//          AND m.start_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
//        GROUP BY m.id, m.hometeamname, m.awayteamname, m.start_time, m.status, s.name
//        ORDER BY m.start_time DESC
//        LIMIT 50`,
//       [daysNum]
//     );

//     /* ════════════════════════════════
//        FINAL RESPONSE
//     ════════════════════════════════ */
//     return res.status(200).json({
//       success: true,

//       match: match
//         ? {
//           id: Number(match_id),
//           home_team: match.hometeamname,
//           away_team: match.awayteamname,
//           series: match.series_name,
//           start_time: match.start_time,
//           status: match.status,
//         }
//         : null,

//       /* ── Tab 1 ── */
//       match_activity: {
//         kpis: {
//           total_users: Number(kpi.total_users),
//           total_ucts: Number(kpi.total_ucts),
//           avg_gen_time_sec: Number(kpi.avg_gen_time_sec),
//           uct_success_rate_pct: kpi.total_requests > 0
//             ? Number(((kpi.success_count / kpi.total_requests) * 100).toFixed(1))
//             : 0,
//           peak_activity_mins_before_kickoff: peakMinsBeforeKickoff,
//         },
//         generation_time_distribution: {
//           p10_fastest: pct(times, 10),
//           p50_median: pct(times, 50),
//           mean_average: mean,
//           p95_slow: pct(times, 95),
//           p99_worst: pct(times, 99),
//           target_sec: 2.0,
//         },
//         pack_tier_breakdown: packTiers,
//         time_series: timeSeries,
//       },

//       /* ── Tab 2 ── */
//       live_stream: {
//         rolling_60s: {
//           active_users: Number(rolling.active_users),
//           ucts_last_60s: Number(rolling.ucts_last_60s),
//           avg_gen_sec: Number(rolling.avg_gen_sec),
//         },
//         feed: liveFeed.map((f) => ({
//           id: f.id,
//           user_id: f.user_id,
//           fullname: f.fullname,
//           country: f.country,
//           plan_name: f.plan_name,
//           is_free: f.plan_name === "Free",
//           total_teams: f.total_teams,
//           gen_time_sec: f.generation_time_ms
//             ? Number((f.generation_time_ms / 1000).toFixed(2))
//             : null,
//           status: f.status,
//           seconds_ago: Math.round((new Date() - new Date(f.created_at)) / 1000),
//           created_at: f.created_at,
//         })),
//       },

//       /* ── Tab 3 ── */
//       peak_analysis: {
//         window_mins: windowNum,
//         peak_minute: peakMinute,
//         per_minute: perMinute,
//         by_country: byCountry,
//       },

//       /* ── Tab 4 ── */
//       engine_performance: {
//         kpis: {
//           total_requests: Number(funnel.total_requests),
//           first_try_success: Number(funnel.first_try_success),
//           first_try_failed: Number(funnel.first_try_failed),
//           retriggers: Number(funnel.retriggers),
//           retry_success: Number(funnel.retry_success),
//           retry_failed: Number(funnel.retry_failed),
//           second_retry_success: Number(funnel.second_retry_success),
//           final_success_rate: funnel.total_requests > 0
//             ? `${((uniqueUsersGotUct / funnel.total_requests) * 100).toFixed(1)}%`
//             : "0%",
//         },
//         funnel: funnelSteps,
//         failure_breakdown: failures.map((f) => ({
//           failure_reason: f.failure_reason,
//           failure_description: f.failure_description,
//           first_try_fails: Number(f.first_try_fails),
//           retry_fails: Number(f.retry_fails),
//           total: Number(f.total),
//           pct_of_failures: totalFailed > 0
//             ? `${((Number(f.total) / totalFailed) * 100).toFixed(1)}%`
//             : "0%",
//         })),
//       },

//       /* ── Tab 5 ── */
//       capacity_planning: {
//         peak_matches: peakLoads.map((r) => ({
//           match_id: r.match_id,
//           home_team: r.hometeamname,
//           away_team: r.awayteamname,
//           start_time: r.start_time,
//           total_ucts: Number(r.total_ucts),
//           peak_per_min: Number(r.peak_per_min),
//         })),
//         hourly_load: hourlyLoad,
//       },

//       /* ── Tab 6 ── */
//       match_history: matchHistory.map((m) => ({
//         id: m.id,
//         home_team: m.hometeamname,
//         away_team: m.awayteamname,
//         series: m.series_name,
//         start_time: m.start_time,
//         status: m.status,
//         unique_users: Number(m.unique_users),
//         total_ucts: Number(m.total_ucts),
//         success_ucts: Number(m.success_ucts),
//         failed_ucts: Number(m.failed_ucts),
//         avg_gen_sec: Number(m.avg_gen_sec),
//         success_rate: m.total_ucts > 0
//           ? `${((m.success_ucts / m.total_ucts) * 100).toFixed(1)}%`
//           : "0%",
//       })),
//     });

//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

export const getEnginePerformance = async (req, res) => {
  try {
    const { match_id } = req.query;

    if (!match_id) {
      return res.status(400).json({
        success: false,
        message: "match_id required",
      });
    }

    /* ── 1. Match info ── */
    const [[match]] = await db.execute(
      `SELECT
         m.id,
         m.hometeamname,
         m.awayteamname,
         m.start_time,
         m.status,
         s.name AS series_name
       FROM matches m
       LEFT JOIN series s ON s.id = m.series_id
       WHERE m.id = ?`,
      [match_id]
    );

    if (!match) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }

    /* ── 2. Summary stats ── */
    const [[summary]] = await db.execute(
      `SELECT
         COUNT(DISTINCT user_id)                                AS total_users,
         COUNT(*)                                               AS total_requests,
         COUNT(DISTINCT CASE WHEN status = 'success' THEN user_id END) AS successful_users,
         SUM(total_teams)                                       AS total_teams_generated,

         MIN(generation_time_ms)                                AS fastest_ms,
         MAX(generation_time_ms)                                AS slowest_ms,
         ROUND(AVG(generation_time_ms), 0)                     AS avg_ms,

         SUM(CASE WHEN attempt_number = 1 AND status = 'success' THEN 1 ELSE 0 END) AS first_try_success,
         SUM(CASE WHEN attempt_number = 1 AND status != 'success' THEN 1 ELSE 0 END) AS first_try_failed,
         SUM(CASE WHEN attempt_number = 2 THEN 1 ELSE 0 END)   AS retriggers,
         SUM(CASE WHEN attempt_number = 2 AND status = 'success' THEN 1 ELSE 0 END) AS retry_success,
         SUM(CASE WHEN attempt_number = 2 AND status != 'success' THEN 1 ELSE 0 END) AS retry_failed,
         SUM(CASE WHEN attempt_number > 2 AND status = 'success' THEN 1 ELSE 0 END) AS second_retry_success,

         MIN(created_at)                                        AS first_generation,
         MAX(created_at)                                        AS last_generation
       FROM match_generation_log
       WHERE match_id = ?`,
      [match_id]
    );

    /* ── 3. Percentiles (p10, p50, p95, p99) ── */
    const [timings] = await db.execute(
      `SELECT generation_time_ms
       FROM match_generation_log
       WHERE match_id = ?
         AND generation_time_ms IS NOT NULL
       ORDER BY generation_time_ms ASC`,
      [match_id]
    );

    const times = timings.map((t) => Number(t.generation_time_ms));
    const getPercentile = (arr, p) => {
      if (!arr.length) return 0;
      const idx = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, idx)];
    };

    const p10 = getPercentile(times, 10);
    const p50 = getPercentile(times, 50);
    const p95 = getPercentile(times, 95);
    const p99 = getPercentile(times, 99);

    /* ── 4. Peak activity — which minute had most generations ── */
    const [[peak]] = await db.execute(
      `SELECT
         DATE_FORMAT(created_at, '%H:%i') AS peak_minute,
         COUNT(*)                          AS count
       FROM match_generation_log
       WHERE match_id = ?
       GROUP BY DATE_FORMAT(created_at, '%H:%i')
       ORDER BY count DESC
       LIMIT 1`,
      [match_id]
    );

    /* ── 5. Failure reason breakdown ── */
    const [failures] = await db.execute(
      `SELECT
         failure_reason,
         failure_description,
         SUM(CASE WHEN attempt_number = 1 THEN 1 ELSE 0 END) AS first_try_fails,
         SUM(CASE WHEN attempt_number = 2 THEN 1 ELSE 0 END) AS retry_fails,
         COUNT(*)                                              AS total
       FROM match_generation_log
       WHERE match_id  = ?
         AND status   != 'success'
         AND failure_reason IS NOT NULL
       GROUP BY failure_reason, failure_description
       ORDER BY total DESC`,
      [match_id]
    );

    /* ── 6. Calculations ── */
    const totalRequests   = Number(summary.total_requests)    || 0;
    const firstTrySuccess = Number(summary.first_try_success) || 0;
    const firstTryFailed  = Number(summary.first_try_failed)  || 0;
    const retriggers      = Number(summary.retriggers)        || 0;
    const retrySuccess    = Number(summary.retry_success)     || 0;
    const retryFailed     = Number(summary.retry_failed)      || 0;
    const secondRetry     = Number(summary.second_retry_success) || 0;
    const totalUsers      = Number(summary.total_users)       || 0;
    const successUsers    = Number(summary.successful_users)  || 0;

    const totalFailures   = failures.reduce((a, f) => a + Number(f.total), 0);

    /* peak activity — mins before kickoff */
    const kickoffTime    = new Date(match.start_time);
    const peakTime       = peak?.peak_minute
      ? new Date(`${match.start_time.toISOString().split("T")[0]}T${peak.peak_minute}:00`)
      : null;
    const minsBeforeKickoff = peakTime
      ? Math.round((kickoffTime - peakTime) / (1000 * 60))
      : null;

    return res.status(200).json({
      success: true,

      match: {
        id:         match.id,
        home_team:  match.hometeamname,
        away_team:  match.awayteamname,
        series:     match.series_name,
        start_time: match.start_time,
        status:     match.status,
      },

      summary: {
        total_users:           totalUsers,
        total_teams_generated: Number(summary.total_teams_generated) || 0,
        success_rate_pct:      totalUsers > 0
          ? ((successUsers / totalUsers) * 100).toFixed(1)
          : "0.0",
        peak_activity: {
          time:               peak?.peak_minute    || null,
          count:              Number(peak?.count)  || 0,
          mins_before_kickoff: minsBeforeKickoff,
        },
      },

      generation_time: {
        fastest_ms:  Number(summary.fastest_ms) || 0,
        p10_ms:      p10,
        p50_ms:      p50,
        avg_ms:      Number(summary.avg_ms)     || 0,
        p95_ms:      p95,
        p99_ms:      p99,
        slowest_ms:  Number(summary.slowest_ms) || 0,
      },

      reliability: {
        total_requests:    totalRequests,
        first_try_success: firstTrySuccess,
        first_try_failed:  firstTryFailed,
        retriggers:        retriggers,
        retry_success:     retrySuccess,
        retry_failed:      retryFailed,
        second_retry_success: secondRetry,
        first_try_success_pct: totalRequests > 0
          ? ((firstTrySuccess / totalRequests) * 100).toFixed(1)
          : "0.0",
        retry_recovery_pct: retriggers > 0
          ? ((retrySuccess / retriggers) * 100).toFixed(1)
          : "0.0",
      },

      failure_breakdown: failures.map((f) => ({
        reason:       f.failure_reason,
        description:  f.failure_description,
        first_try:    Number(f.first_try_fails),
        retry:        Number(f.retry_fails),
        total:        Number(f.total),
        pct_of_failures: totalFailures > 0
          ? ((Number(f.total) / totalFailures) * 100).toFixed(1)
          : "0.0",
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


export const getLiveStream = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    /* ── 1. Today's stats ── */
    const [[todayStats]] = await db.execute(
      `SELECT
         COUNT(DISTINCT mgl.match_id)  AS matches_today,
         COUNT(DISTINCT mgl.id)        AS ucts_today,
         COUNT(DISTINCT mgl.user_id)   AS unique_users_today,
         COALESCE(SUM(ABS(ct.coins)), 0) AS coins_consumed_today
       FROM match_generation_log mgl
       LEFT JOIN coins_transactions ct
         ON ct.user_id    = mgl.user_id
        AND ct.coins      < 0
        AND ct.status     = 'success'
        AND DATE(ct.created_at) = ?
       WHERE DATE(mgl.created_at) = ?`,
      [today, today]
    );

    /* ── 2. P95 latency — last 30 days ── */
    const [latencies] = await db.execute(
      `SELECT generation_time_ms
       FROM match_generation_log
       WHERE generation_time_ms IS NOT NULL
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       ORDER BY generation_time_ms ASC`
    );

    const times = latencies.map((l) => Number(l.generation_time_ms));
    const getPercentile = (arr, p) => {
      if (!arr.length) return 0;
      const idx = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, idx)];
    };
    const p95 = getPercentile(times, 95);

    /* ── 3. Engine uptime — success rate last 30 days ── */
    const [[uptime]] = await db.execute(
      `SELECT
         COUNT(*)                                              AS total,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success
       FROM match_generation_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    const uptimePct = Number(uptime.total) > 0
      ? ((Number(uptime.success) / Number(uptime.total)) * 100).toFixed(2)
      : "100.00";

    /* ── 4. Coin balance ledger ── */
    const [[coinsIssued]] = await db.execute(
      `SELECT COALESCE(SUM(coins), 0) AS total
       FROM coins_transactions
       WHERE coins > 0 AND status = 'success'`
    );

    const [[freeUcts]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE free_trial_used = 1`
    );

    const [[coinsConsumed]] = await db.execute(
      `SELECT COALESCE(SUM(ABS(coins)), 0) AS total
       FROM coins_transactions
       WHERE coins < 0 AND status = 'success'`
    );

    const [[walletBalance]] = await db.execute(
      `SELECT COALESCE(SUM(available_coins), 0) AS total,
              COUNT(DISTINCT user_id)            AS buyers_with_balance
       FROM user_coins
       WHERE available_coins > 0`
    );

    /* ── 5. Today's coin delta ── */
    const [[todayCoinsIssued]] = await db.execute(
      `SELECT COALESCE(SUM(coins), 0) AS total
       FROM coins_transactions
       WHERE coins > 0 AND status = 'success'
         AND DATE(created_at) = ?`,
      [today]
    );

    const [[todayCoinsConsumed]] = await db.execute(
      `SELECT COALESCE(SUM(ABS(coins)), 0) AS total
       FROM coins_transactions
       WHERE coins < 0 AND status = 'success'
         AND DATE(created_at) = ?`,
      [today]
    );

    /* ── 6. Live UCT stream — last 20 ── */
    const [stream] = await db.execute(
      `SELECT
         mgl.id,
         mgl.user_id,
         mgl.match_id,
         mgl.total_teams,
         mgl.generation_time_ms,
         mgl.created_at,
         u.fullname,
         u.country,
         u.free_trial_used,
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
       ORDER BY mgl.created_at DESC
       LIMIT 20`
    );

    const fromPurchases  = Number(coinsIssued.total);
    const freeUctCount   = Number(freeUcts.total);
    const totalIssued    = fromPurchases + freeUctCount;
    const totalConsumed  = Number(coinsConsumed.total);
    const remaining      = Number(walletBalance.total);
    const buyersWithBal  = Number(walletBalance.buyers_with_balance);

    return res.status(200).json({
      success: true,

      today: {
        matches_today:       Number(todayStats.matches_today),
        ucts_today:          Number(todayStats.ucts_today),
        unique_users_today:  Number(todayStats.unique_users_today),
        coins_consumed_today: Number(todayStats.coins_consumed_today),
        engine_uptime_pct:   uptimePct,
        p95_latency_ms:      p95,
      },

      coin_ledger: {
        issued: {
          from_purchases:   fromPurchases,
          free_ucts:        freeUctCount,
          total_issued:     totalIssued,
        },
        disposition: {
          consumed_paid:    totalConsumed - freeUctCount,
          consumed_free:    freeUctCount,
          total_ucts:       totalConsumed,
          remaining:        remaining,
          avg_per_buyer:    buyersWithBal > 0
            ? (remaining / buyersWithBal).toFixed(1)
            : "0.0",
          buyers_with_balance: buyersWithBal,
        },
        reconciles: totalConsumed + remaining === totalIssued,
        today_delta: {
          coins_issued:    Number(todayCoinsIssued.total),
          coins_consumed:  Number(todayCoinsConsumed.total),
          net_change:      Number(todayCoinsIssued.total) - Number(todayCoinsConsumed.total),
        },
      },

      live_stream: stream.map((s) => ({
        id:                 s.id,
        user_id:            s.user_id,
        fullname:           s.fullname,
        country:            s.country,
        match:              `${s.hometeamname} vs ${s.awayteamname}`,
        total_teams:        s.total_teams,
        generation_time_ms: s.generation_time_ms,
        plan_name:          s.plan_name,
        is_free:            !s.plan_name,
        created_at:         s.created_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};