//  // reports.controller.js
import db from "../../../config/db.js";

/* ═══════════════════════════════════════════════════
   GET /admin/dashboard/report
   Sections: Users & Engine KPIs, Top Countries,
             Recent Activity, Today's Match UCTs
   (No financial/revenue data here)
   ═══════════════════════════════════════════════════ */
export const getDashboardReport = async (req, res) => {
  try {

    /* ════════════════════════════════
       USERS & ENGINE — AT A GLANCE
    ════════════════════════════════ */
    const [[totalUsers]] = await db.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS this_week
       FROM users
       WHERE CAST(account_status AS CHAR) != 'deleted'`
    );

    const [[verified]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE CAST(account_status AS CHAR) != 'deleted'
         AND email_verify  = 1
         AND mobile_verify = 1`
    );

    const [[activePurchased]] = await db.execute(
      `SELECT COUNT(DISTINCT user_id) AS total
       FROM user_subscriptions
       WHERE status = 'active'
         AND expiry_date > NOW()`
    );

    const [[idleNoPack]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM users u
       WHERE CAST(u.account_status AS CHAR) != 'deleted'
         AND NOT EXISTS (
           SELECT 1 FROM user_subscriptions us
           WHERE us.user_id = u.id
         )`
    );

    const [[uctToday]] = await db.execute(
      `SELECT
         COUNT(DISTINCT id)      AS total_ucts,
         COUNT(DISTINCT user_id) AS unique_users
       FROM match_generation_log
       WHERE DATE(created_at) = CURDATE()`
    );

    /* ── growth % vs last week ── */
    const [[lastWeekTotal]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE CAST(account_status AS CHAR) != 'deleted'
         AND created_at <= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    const [[lastWeekActive]] = await db.execute(
      `SELECT COUNT(DISTINCT user_id) AS total
       FROM user_subscriptions
       WHERE status = 'active'
         AND expiry_date > NOW()
         AND created_at <= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    const totalUsersCount   = Number(totalUsers.total);
    const activePurchasedCt = Number(activePurchased.total);

    const userGrowthPct = Number(lastWeekTotal.total) > 0
      ? Number((((totalUsersCount - Number(lastWeekTotal.total)) / Number(lastWeekTotal.total)) * 100).toFixed(1))
      : 0;

    const activeGrowthPct = Number(lastWeekActive.total) > 0
      ? Number((((activePurchasedCt - Number(lastWeekActive.total)) / Number(lastWeekActive.total)) * 100).toFixed(1))
      : 0;

    /* ════════════════════════════════
       MONETIZATION & LIFECYCLE (non-financial only)
    ════════════════════════════════ */
    const [[deletedAccounts]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE CAST(account_status AS CHAR) = 'deleted'`
    );

    const activeRatePct = totalUsersCount > 0
      ? Number(((activePurchasedCt / totalUsersCount) * 100).toFixed(1))
      : 0;

    /* ════════════════════════════════
       TOP COUNTRIES BY USERS
    ════════════════════════════════ */
    const [byCountry] = await db.execute(
      `SELECT
         country,
         COUNT(*) AS users
       FROM users
       WHERE CAST(account_status AS CHAR) != 'deleted'
       GROUP BY country
       ORDER BY users DESC
       LIMIT 10`
    );

    const totalCountryUsers = byCountry.reduce((s, r) => s + Number(r.users), 0);

    /* ════════════════════════════════
       RECENT ACTIVITY (live event stream)
    ════════════════════════════════ */
    const [purchases] = await db.execute(
      `SELECT
         'purchase'      AS type,
         us.created_at,
         u.fullname,
         u.country,
         us.plan_name,
         us.coins
        
       FROM user_subscriptions us
       JOIN users u ON u.id = us.user_id
       WHERE us.amount > 0
         AND us.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY us.created_at DESC
       LIMIT 10`
    );

    const [generations] = await db.execute(
      `SELECT
         'uct_generated'        AS type,
         mgl.created_at,
         u.fullname,
         u.country,
         NULL                   AS plan_name,
         NULL                   AS coins,
         CONCAT(m.hometeamname, ' vs ', m.awayteamname) AS match_label
       FROM match_generation_log mgl
       JOIN users   u ON u.id = mgl.user_id
       JOIN matches m ON m.id = mgl.match_id
       WHERE mgl.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY mgl.created_at DESC
       LIMIT 10`
    );

    const [signups] = await db.execute(
      `SELECT
         'signup'  AS type,
         created_at,
         fullname,
         country,
         NULL AS plan_name,
         NULL AS coins,
         NULL AS match_label
       FROM users
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY created_at DESC
       LIMIT 10`
    );

    const [deletions] = await db.execute(
      `SELECT
         'deleted'  AS type,
         updated_at AS created_at,
         id         AS fullname,
         NULL       AS country,
         NULL AS plan_name,
         NULL AS coins,
         NULL AS match_label
       FROM users
       WHERE CAST(account_status AS CHAR) = 'deleted'
         AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY updated_at DESC
       LIMIT 5`
    );

    const [cancelled] = await db.execute(
      `SELECT
         'uct_cancelled' AS type,
         mgl.created_at,
         u.fullname,
         u.country,
         NULL AS plan_name,
         NULL AS coins,
         NULL AS match_label
       FROM match_generation_log mgl
       JOIN users u ON u.id = mgl.user_id
       WHERE mgl.status     = 'cancelled'
         AND mgl.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY mgl.created_at DESC
       LIMIT 5`
    );

    const [bans] = await db.execute(
      `SELECT
         'banned'    AS type,
         updated_at  AS created_at,
         fullname,
         country,
         NULL AS plan_name,
         NULL AS coins,
         NULL AS match_label
       FROM users
       WHERE CAST(account_status AS CHAR) = 'banned'
         AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY updated_at DESC
       LIMIT 5`
    );

    const recentActivity = [
      ...purchases,
      ...generations,
      ...signups,
      ...deletions,
      ...cancelled,
      ...bans,
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20)
      .map((e) => ({
        type:         e.type,
        fullname:     e.fullname,
        country:      e.country,
        plan_name:    e.plan_name,
        coins:        e.coins ? Number(e.coins) : null,
        match_label:  e.match_label,
        time_ago_sec: Math.round((new Date() - new Date(e.created_at)) / 1000),
        created_at:   e.created_at,
      }));

    /* ════════════════════════════════
       TODAY'S MATCH · UCTs USED
    ════════════════════════════════ */
    const [todayMatches] = await db.execute(
      `SELECT
         m.id,
         m.hometeamname,
         m.awayteamname,
         m.start_time,
         m.status,
         s.name                    AS series_name,
         COUNT(DISTINCT mgl.id)    AS ucts_used,
         COUNT(DISTINCT u.country) AS countries_active
       FROM matches m
       LEFT JOIN series s                ON s.seriesid    = m.series_id
       LEFT JOIN match_generation_log mgl ON mgl.match_id  = m.id
         AND DATE(mgl.created_at) = CURDATE()
       LEFT JOIN users u                 ON u.id           = mgl.user_id
       WHERE DATE(m.start_time) = CURDATE()
         AND m.is_active = 1
       GROUP BY m.id, m.hometeamname, m.awayteamname, m.start_time, m.status, s.name
       ORDER BY ucts_used DESC`
    );

    const totalUctsToday = Number(uctToday.total_ucts);

    /* ════════════════════════════════
       FINAL RESPONSE
    ════════════════════════════════ */
    return res.status(200).json({
      success: true,

      users_at_a_glance: {
        total_users:      totalUsersCount,
        total_growth_wk:  `+${userGrowthPct}%`,
        active_purchased: activePurchasedCt,
        active_growth_wk: `+${activeGrowthPct}%`,
        idle_no_pack:     Number(idleNoPack.total),
        ucts_used_today:  totalUctsToday,
        users_today:      Number(uctToday.unique_users),
      },

      monetization_lifecycle: {
        deleted_accounts: Number(deletedAccounts.total),
        active_rate_pct:  activeRatePct,
        verified_users:   Number(verified.total),
      },

      top_countries_by_users: byCountry.map((c) => ({
        country: c.country,
        users:   Number(c.users),
        pct:     totalCountryUsers > 0
          ? Number(((Number(c.users) / totalCountryUsers) * 100).toFixed(1))
          : 0,
      })),

      recent_activity: recentActivity,

      today_match: {
        total_ucts_today: totalUctsToday,
        matches: todayMatches.map((m) => ({
          id:                m.id,
          home_team:         m.hometeamname,
          away_team:         m.awayteamname,
          series:            m.series_name,
          start_time:        m.start_time,
          status:            m.status,
          ucts_used:         Number(m.ucts_used),
          countries_active:  Number(m.countries_active),
        })),
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

 

/* ═══════════════════════════════════════════════════
   1. USERS LIST
   GET /admin/users?page=1&limit=10&status=active|idle|deleted&country=&search=
   ═══════════════════════════════════════════════════ */
export const getUsersList = async (req, res) => {
  try {
    const {
      page    = 1,
      limit   = 10,
      status  = "",   // active | idle | deleted
      country = "",
      search  = "",
    } = req.query;

    const limitNum  = Number(limit);
    const offsetNum = (Number(page) - 1) * limitNum;

    const conditions = [];
    const params      = [];

    /* search */
    if (search) {
      conditions.push(`(u.fullname LIKE ? OR u.email LIKE ? OR CAST(u.id AS CHAR) LIKE ?)`);
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    /* country */
    if (country) {
      conditions.push(`u.country = ?`);
      params.push(country);
    }

    /* status */
    if (status === "active") {
      conditions.push(
        `CAST(u.account_status AS CHAR) != 'deleted'
         AND EXISTS (
           SELECT 1 FROM user_subscriptions us
           WHERE us.user_id = u.id AND us.status = 'active' AND us.expiry_date > NOW()
         )`
      );
    } else if (status === "idle") {
      conditions.push(
        `CAST(u.account_status AS CHAR) != 'deleted'
         AND NOT EXISTS (
           SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id
         )`
      );
    } else if (status === "deleted") {
      conditions.push(`CAST(u.account_status AS CHAR) = 'deleted'`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    /* ── Main list ── */
    const [users] = await db.execute(
      `SELECT
         u.id,
         u.fullname,
         u.email,
         u.country,
         u.account_status,
         u.created_at,
         COALESCE(uc.available_coins, 0)              AS coins,
         GROUP_CONCAT(DISTINCT us.plan_name ORDER BY us.created_at DESC) AS packs_purchased,
         EXISTS (
           SELECT 1 FROM user_subscriptions us2
           WHERE us2.user_id = u.id AND us2.status = 'active' AND us2.expiry_date > NOW()
         )                                              AS is_active_pack
       FROM users u
       LEFT JOIN user_coins        uc ON uc.user_id = u.id
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
       ${whereClause}
       GROUP BY u.id, u.fullname, u.email, u.country, u.account_status, u.created_at, uc.available_coins
       ORDER BY u.id DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    /* ── Total count ── */
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       LEFT JOIN user_subscriptions us ON us.user_id = u.id
       ${whereClause}`,
      params
    );

    /* ── KPI cards ── */
    const [[kpis]] = await db.execute(
      `SELECT
         COUNT(*)                                                                    AS total_users,
         SUM(CASE WHEN CAST(account_status AS CHAR) = 'deleted' THEN 1 ELSE 0 END)  AS deleted,
         SUM(CASE WHEN CAST(account_status AS CHAR) != 'deleted'
               AND EXISTS (
                 SELECT 1 FROM user_subscriptions us
                 WHERE us.user_id = users.id AND us.status = 'active' AND us.expiry_date > NOW()
               ) THEN 1 ELSE 0 END)                                                  AS active_accounts,
         SUM(CASE WHEN CAST(account_status AS CHAR) != 'deleted'
               AND NOT EXISTS (
                 SELECT 1 FROM user_subscriptions us WHERE us.user_id = users.id
               ) THEN 1 ELSE 0 END)                                                  AS idle_users
       FROM users`
    );

    return res.status(200).json({
      success: true,
      kpis: {
        total_users:     Number(kpis.total_users),
        active_accounts: Number(kpis.active_accounts),
        idle_users:       Number(kpis.idle_users),
        deleted:          Number(kpis.deleted),
      },
      pagination: {
        total:       Number(total),
        page:        Number(page),
        limit:       limitNum,
        total_pages: Math.ceil(Number(total) / limitNum),
      },
      filters: { search, country, status },
      users: users.map((u) => ({
        id:              u.id,
        user_code:       `U-${u.id}`,
        fullname:        u.account_status === "deleted" ? "Anonymized" : u.fullname,
        email:           u.account_status === "deleted" ? null : u.email,
        country:         u.country,
        packs_purchased: u.packs_purchased ? u.packs_purchased.split(",") : [],
        coins:           Number(u.coins),
        joined:          u.created_at,
        status:          u.account_status === "deleted"
          ? "deleted"
          : (u.is_active_pack ? "active" : "idle"),
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. COIN EXPIRY & REMINDERS
   GET /admin/coin-expiry?window=30d|15d|expired
   Coins expire 365 days after latest purchase.
   ═══════════════════════════════════════════════════ */
export const getCoinExpiry = async (req, res) => {
  try {
    const { window = "30d" } = req.query;

    /* Only 4 valid window values accepted */
    const validWindows = ["07d", "15d", "30d", "expired"];
    if (!validWindows.includes(window)) {
      return res.status(400).json({
        success: false,
        message: `Invalid window value. Allowed: ${validWindows.join(", ")}`,
      });
    }

    /* Per-row logic (NOT latest-only): prati subscription row separate ga
       check avtundi. Ex: user ki 3 packs unna prathi pack vere expiry_date
       kaligi untundi. Latest row active aina, పాత rows expired+unused
       unte avi kuda chupisthamu. coins > matches_used (unused coins migili
       unna rows matrame). */
    const statusFilter =
      window === "expired"
        ? `us.status = 'expired' AND us.coins > us.matches_used`
        : window === "15d"
        ? `us.status = 'active' AND us.coins > us.matches_used
           AND DATEDIFF(us.expiry_date, CURDATE()) BETWEEN 0 AND 15`
        : `us.status = 'active' AND us.coins > us.matches_used
           AND DATEDIFF(us.expiry_date, CURDATE()) BETWEEN 16 AND 30`;

    const [rows] = await db.execute(
      `SELECT
         u.id,
         u.fullname,
         u.country,
         us.id                                AS subscription_id,
         us.plan_name,
         (us.coins - us.matches_used)         AS coins_left,
         us.created_at                        AS last_purchase_date,
         us.expiry_date,
         us.status,
         DATEDIFF(us.expiry_date, CURDATE())  AS days_left
       FROM user_subscriptions us
       JOIN users u ON u.id = us.user_id
       WHERE ${statusFilter}
       ORDER BY days_left ASC`
    );

    /* ── Summary counts across all buckets (status-based, per-row) ── */
    const [[summary]] = await db.execute(
      `SELECT
         SUM(CASE WHEN us.status = 'active' AND us.coins > us.matches_used
               AND DATEDIFF(us.expiry_date, CURDATE()) BETWEEN 16 AND 30
               THEN 1 ELSE 0 END)                                          AS reminder_30d,
         SUM(CASE WHEN us.status = 'active' AND us.coins > us.matches_used
               AND DATEDIFF(us.expiry_date, CURDATE()) BETWEEN 0 AND 15
               THEN 1 ELSE 0 END)                                          AS reminder_15d,
         SUM(CASE WHEN us.status = 'expired' AND us.coins > us.matches_used
               THEN 1 ELSE 0 END)                                          AS already_expired
       FROM user_subscriptions us`
    );

    /* ── All-time expired coins total ── */
    const [[expiredAllTime]] = await db.execute(
      `SELECT COALESCE(SUM(us.coins - us.matches_used), 0) AS total
       FROM user_subscriptions us
       WHERE us.status = 'expired'
         AND us.coins > us.matches_used`
    );

    const coinsStillToUse = rows.reduce((s, r) => s + Number(r.coins_left), 0);

    return res.status(200).json({
      success: true,
      summary: {
        reminder_30d:           Number(summary.reminder_30d),
        reminder_15d:           Number(summary.reminder_15d),
        already_expired:        Number(summary.already_expired),
        coins_expired_all_time: Number(expiredAllTime.total),
      },
      window,
      users_in_window:    rows.length,
      coins_still_to_use: coinsStillToUse,
      users: rows.map((r) => ({
        id:                 r.id,
        user_code:          `U-${r.id}`,
        fullname:           r.fullname,
        country:            r.country,
        coins_left:         Number(r.coins_left),
        last_purchase_date: r.last_purchase_date,
        expiry_date:        r.expiry_date,
        days_left:          Number(r.days_left),
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}; 


/* ═══════════════════════════════════════════════════
   GET /admin/reports/countries
   Sections: Total users by country, Country breakdown
             (total/active/idle), Manage countries list
   ═══════════════════════════════════════════════════ */
export const getCountriesReport = async (req, res) => {
  try {
 
    /* ── Per-country breakdown: total / active (purchased) / idle (no pack) ── */
    const [countries] = await db.execute(
      `SELECT
         u.country,
         COUNT(*)                                                              AS total_users,
         SUM(CASE WHEN EXISTS (
               SELECT 1 FROM user_subscriptions us
               WHERE us.user_id = u.id
                 AND us.status  = 'active'
                 AND us.expiry_date > NOW()
             ) THEN 1 ELSE 0 END)                                              AS coin_buyers,
         SUM(CASE WHEN NOT EXISTS (
               SELECT 1 FROM user_subscriptions us
               WHERE us.user_id = u.id
             ) THEN 1 ELSE 0 END)                                              AS no_pack
       FROM users u
       WHERE CAST(u.account_status AS CHAR) != 'deleted'
       GROUP BY u.country
       ORDER BY total_users DESC`
    );
 
    const totalUsers = countries.reduce((s, c) => s + Number(c.total_users), 0);
 
    const countryList = countries.map((c) => ({
      country:      c.country,
      total_users:  Number(c.total_users),
      coin_buyers:  Number(c.coin_buyers),
      no_pack:      Number(c.no_pack),
      share_pct:    totalUsers > 0
        ? Number(((Number(c.total_users) / totalUsers) * 100).toFixed(1))
        : 0,
    }));
 
    return res.status(200).json({
      success: true,
 
      total_users_overall: totalUsers,
      total_countries:     countryList.length,
 
      /* ── Total users by country (chart + list) ── */
      by_country: countryList,
 
      /* ── Country breakdown (table) ── */
      breakdown: countryList,
 
      /* ── Manage countries (list only, no add/edit/delete here) ── */
      manage_countries: countryList.map((c) => ({
        country: c.country,
        users:   c.total_users,
      })),
 
      totals: {
        total_users: totalUsers,
        coin_buyers: countryList.reduce((s, c) => s + c.coin_buyers, 0),
        no_pack:     countryList.reduce((s, c) => s + c.no_pack, 0),
        share_pct:   100,
      },
    });
 
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


 

/* ═══════════════════════════════════════════════════
   1. OVERVIEW + RECONCILIATION
   GET /admin/uct-activity/overview
   Sections: KPI cards, Today's matches table,
             Coins reconciliation
   ═══════════════════════════════════════════════════ */
export const getUctOverview = async (req, res) => {
  try {

    /* ── KPI: UCTs used today, teams generated, active fixtures, failed/refunded ── */
    const [[kpi]] = await db.execute(
      `SELECT
         COUNT(DISTINCT mgl.id)                                                  AS ucts_today,
         COUNT(DISTINCT mgl.id) * 20                                             AS teams_generated,
         SUM(CASE WHEN mgl.status = 'failed' THEN 1 ELSE 0 END)                 AS failed_refunded
       FROM match_generation_log mgl
       WHERE DATE(mgl.created_at) = CURDATE()`
    );

    const [[activeFixtures]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM matches
       WHERE DATE(start_time) = CURDATE()
         AND is_active = 1
         AND status IN ('LIVE', 'UPCOMING')`
    );

    /* ── Today's matches — UCT usage table ── */
    const [todayMatches] = await db.execute(
      `SELECT
         m.id,
         m.hometeamname,
         m.awayteamname,
         m.status,
         s.name                    AS series_name,
         COUNT(DISTINCT mgl.id)    AS ucts_used
       FROM matches m
       LEFT JOIN series s                ON s.seriesid    = m.series_id
       LEFT JOIN match_generation_log mgl ON mgl.match_id  = m.id
         AND DATE(mgl.created_at) = CURDATE()
       WHERE DATE(m.start_time) = CURDATE()
         AND m.is_active = 1
       GROUP BY m.id, m.hometeamname, m.awayteamname, m.status, s.name
       ORDER BY ucts_used DESC`
    );

    const totalUctsToday = todayMatches.reduce((s, m) => s + Number(m.ucts_used), 0);

    /* ── Coins reconciliation ── */
    const [[purchased]] = await db.execute(
      `SELECT COALESCE(SUM(coins), 0) AS total
       FROM user_subscriptions
       WHERE amount > 0`
    );

    const [[consumed]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM match_generation_log
       WHERE status = 'success'`
    );

    const [[expired]] = await db.execute(
      `SELECT COALESCE(SUM(coins - matches_used), 0) AS total
       FROM user_subscriptions
       WHERE status = 'expired'
         AND coins > matches_used`
    );

    const [[inWallets]] = await db.execute(
      `SELECT COALESCE(SUM(coins - matches_used), 0) AS total
       FROM user_subscriptions
       WHERE status = 'active'
         AND expiry_date > NOW()
         AND coins > matches_used`
    );

    const purchasedTotal = Number(purchased.total);
    const consumedTotal  = Number(consumed.total);
    const expiredTotal   = Number(expired.total);
    const walletsTotal   = Number(inWallets.total);
    const reconciledSum  = consumedTotal + expiredTotal + walletsTotal;

    return res.status(200).json({
      success: true,

      kpis: {
        ucts_used_today:  Number(kpi.ucts_today),
        teams_generated:  Number(kpi.teams_generated),
        active_fixtures:  Number(activeFixtures.total),
        failed_refunded:  Number(kpi.failed_refunded),
      },

      today_matches: {
        total_ucts_today: totalUctsToday,
        matches: todayMatches.map((m) => ({
          id:              m.id,
          match:           `${m.hometeamname} vs ${m.awayteamname}`,
          series:          m.series_name,
          status:          m.status,
          ucts_used:       Number(m.ucts_used),
          teams_generated: Number(m.ucts_used) * 20,
          share_pct:       totalUctsToday > 0
            ? Number(((Number(m.ucts_used) / totalUctsToday) * 100).toFixed(1))
            : 0,
        })),
      },

      coins_reconciliation: {
        coins_purchased: purchasedTotal,
        coins_consumed:  consumedTotal,
        coins_expired:   expiredTotal,
        coins_in_wallets: walletsTotal,
        is_balanced:     purchasedTotal === reconciledSum,
        breakdown_pct: {
          consumed_pct: purchasedTotal > 0 ? Number(((consumedTotal / purchasedTotal) * 100).toFixed(1)) : 0,
          expired_pct:  purchasedTotal > 0 ? Number(((expiredTotal  / purchasedTotal) * 100).toFixed(1)) : 0,
          wallets_pct:  purchasedTotal > 0 ? Number(((walletsTotal  / purchasedTotal) * 100).toFixed(1)) : 0,
        },
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. MATCH DRILL-DOWN
   GET /admin/uct-activity/match-drilldown?match_id=xxx
   Sections: Selected match summary, Region-wise users,
             Lineouts → Kickoff time-series
   ═══════════════════════════════════════════════════ */
export const getMatchDrilldown = async (req, res) => {
  try {
    const { match_id } = req.query;
    if (!match_id) return res.status(400).json({ success: false, message: "match_id required" });

    /* ── Match summary ── */
    const [[match]] = await db.execute(
      `SELECT
         m.id, m.hometeamname, m.awayteamname, m.start_time, m.status,
         s.name AS series_name,
         COUNT(DISTINCT mgl.id) AS ucts_used
       FROM matches m
       LEFT JOIN series s                ON s.seriesid   = m.series_id
       LEFT JOIN match_generation_log mgl ON mgl.match_id = m.id
       WHERE m.id = ?
       GROUP BY m.id, m.hometeamname, m.awayteamname, m.start_time, m.status, s.name`,
      [match_id]
    );

    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    /* ── Region-wise users for this match ── */
    const [byRegion] = await db.execute(
      `SELECT
         u.country,
         COUNT(DISTINCT mgl.user_id) AS users
       FROM match_generation_log mgl
       JOIN users u ON u.id = mgl.user_id
       WHERE mgl.match_id = ?
       GROUP BY u.country
       ORDER BY users DESC`,
      [match_id]
    );

    const totalRegionUsers = byRegion.reduce((s, r) => s + Number(r.users), 0);

    /* ── Lineouts → Kickoff time-series ──
       Buckets relative to kickoff: Lineouts, T-2h, T-90m, T-60m, T-45m, T-30m, T-15m, Kickoff */
    const [timeSeries] = await db.execute(
      `SELECT
         mgl.created_at,
         TIMESTAMPDIFF(MINUTE, mgl.created_at, m.start_time) AS mins_before_kickoff
       FROM match_generation_log mgl
       JOIN matches m ON m.id = mgl.match_id
       WHERE mgl.match_id = ?
       ORDER BY mgl.created_at ASC`,
      [match_id]
    );

    const bucketDefs = [
      { label: "T-2h",   max: 120 },
      { label: "T-90m",  max: 90  },
      { label: "T-60m",  max: 60  },
      { label: "T-45m",  max: 45  },
      { label: "T-30m",  max: 30  },
      { label: "T-15m",  max: 15  },
      { label: "Kickoff", max: 0  },
    ];

    const bucketCounts = bucketDefs.map((b) => ({ label: b.label, count: 0 }));
    let lineoutsCount = 0;

    for (const row of timeSeries) {
      const mins = Number(row.mins_before_kickoff);
      if (mins > 120) {
        lineoutsCount++;
        continue;
      }
      for (let i = 0; i < bucketDefs.length; i++) {
        const lowerBound = bucketDefs[i + 1] ? bucketDefs[i + 1].max : -Infinity;
        if (mins <= bucketDefs[i].max && mins > lowerBound) {
          bucketCounts[i].count++;
          break;
        }
      }
    }

    const lineoutsToKickoff = [
      { label: "Lineouts", count: lineoutsCount },
      ...bucketCounts,
    ];

    return res.status(200).json({
      success: true,

      match: {
        id:          match.id,
        home_team:   match.hometeamname,
        away_team:   match.awayteamname,
        series:      match.series_name,
        start_time:  match.start_time,
        status:      match.status,
        ucts_used:   Number(match.ucts_used),
        teams_generated: Number(match.ucts_used) * 20,
      },

      users_region_wise: byRegion.map((r) => ({
        country: r.country,
        users:   Number(r.users),
        pct:     totalRegionUsers > 0
          ? Number(((Number(r.users) / totalRegionUsers) * 100).toFixed(1))
          : 0,
      })),

      lineouts_to_kickoff: lineoutsToKickoff,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   3. ACTIVITY LIST
   GET /admin/uct-activity/list?period=today|month|fy|custom
                                &start_date=&end_date=
                                &page=1&limit=20
   Sections: UCT activity (date-range table),
             Recent generations (paginated feed)
   ═══════════════════════════════════════════════════ */
export const getUctActivityList = async (req, res) => {
  try {
    const {
      period     = "today",   // today | month | fy | custom
      start_date = "",
      end_date   = "",
      page       = 1,
      limit      = 20,
    } = req.query;

    const limitNum  = Number(limit);
    const offsetNum = (Number(page) - 1) * limitNum;

    /* ── Resolve date range based on period ── */
    let rangeStart, rangeEnd;
    const today = new Date();

    if (period === "today") {
      rangeStart = rangeEnd = today.toISOString().slice(0, 10);
    } else if (period === "month") {
      rangeStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      rangeEnd   = today.toISOString().slice(0, 10);
    } else if (period === "fy") {
      /* Indian FY: Apr 1 - Mar 31 */
      const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      rangeStart = `${fyStartYear}-04-01`;
      rangeEnd   = today.toISOString().slice(0, 10);
    } else if (period === "custom") {
      if (!start_date || !end_date) {
        return res.status(400).json({ success: false, message: "start_date and end_date required for custom period" });
      }
      rangeStart = start_date;
      rangeEnd   = end_date;
    } else {
      return res.status(400).json({ success: false, message: "Invalid period. Allowed: today, month, fy, custom" });
    }

    /* ── Per-day breakdown table ── */
    const [dailyStats] = await db.execute(
      `SELECT
         DATE(created_at)                                              AS day,
         COUNT(*)                                                      AS ucts,
         COUNT(*) * 20                                                 AS teams_generated,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)           AS failed_refunded,
         SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)          AS success_count,
         COUNT(*)                                                      AS total_count
       FROM match_generation_log
       WHERE DATE(created_at) BETWEEN ? AND ?
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [rangeStart, rangeEnd]
    );

    const totalUcts        = dailyStats.reduce((s, d) => s + Number(d.ucts), 0);
    const totalTeams       = dailyStats.reduce((s, d) => s + Number(d.teams_generated), 0);
    const totalFailed      = dailyStats.reduce((s, d) => s + Number(d.failed_refunded), 0);
    const totalSuccess     = dailyStats.reduce((s, d) => s + Number(d.success_count), 0);
    const daysCount        = dailyStats.length || 1;

    /* ── Recent generations feed (paginated) ── */
    const [generations] = await db.execute(
      `SELECT
         mgl.id,
         mgl.created_at,
         mgl.status,
         mgl.total_teams,
         u.fullname,
         u.country,
         CONCAT(m.hometeamname, ' vs ', m.awayteamname) AS match_label
       FROM match_generation_log mgl
       JOIN users   u ON u.id = mgl.user_id
       JOIN matches m ON m.id = mgl.match_id
       WHERE DATE(mgl.created_at) BETWEEN ? AND ?
       ORDER BY mgl.created_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      [rangeStart, rangeEnd]
    );

    const [[{ total: genTotal }]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM match_generation_log
       WHERE DATE(created_at) BETWEEN ? AND ?`,
      [rangeStart, rangeEnd]
    );

    return res.status(200).json({
      success: true,

      period,
      range: { start_date: rangeStart, end_date: rangeEnd },

      summary: {
        total_ucts:        totalUcts,
        total_teams:       totalTeams,
        failed_refunded:   totalFailed,
        success_rate_pct:  totalUcts > 0 ? Number(((totalSuccess / totalUcts) * 100).toFixed(1)) : 0,
        avg_per_day:       Number((totalUcts / daysCount).toFixed(0)),
      },

      daily_breakdown: dailyStats.map((d) => ({
        date:             d.day,
        ucts:             Number(d.ucts),
        teams_generated:  Number(d.teams_generated),
        failed_refunded:  Number(d.failed_refunded),
        success_rate_pct: Number(d.total_count) > 0
          ? Number(((Number(d.success_count) / Number(d.total_count)) * 100).toFixed(1))
          : 0,
      })),

      pagination: {
        total:       Number(genTotal),
        page:        Number(page),
        limit:       limitNum,
        total_pages: Math.ceil(Number(genTotal) / limitNum),
      },

      recent_generations: generations.map((g) => ({
        uct_id:      `UCT-${g.id}`,
        fullname:    g.fullname,
        match:       g.match_label,
        country:     g.country,
        teams:       g.total_teams,
        coins_used:  1,
        time_ago_sec: Math.round((new Date() - new Date(g.created_at)) / 1000),
        status:      g.status === "success" ? "Success" : "Failed",
        created_at:  g.created_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


/* ═══════════════════════════════════════════════════
   1. SUMMARY + INSIGHTS
   GET /admin/feedback/votes-summary
   Sections: KPI cards, sentiment insight,
             How users feel donut, Most-requested changes
   ═══════════════════════════════════════════════════ */
export const getVotesSummary = async (req, res) => {
  try {

    /* ── Total responses + vote breakdown (q1) ── */
    const [[totals]] = await db.execute(
      `SELECT
         COUNT(*)                                                                          AS total_responses,
         SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q1')) = 'like_uct'      THEN 1 ELSE 0 END) AS like_uct,
         SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q1')) = 'like_changes'  THEN 1 ELSE 0 END) AS want_changes,
         SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q1')) = 'dislike'       THEN 1 ELSE 0 END) AS dislike,
         AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q11')) AS DECIMAL(3,1)))          AS avg_rating
       FROM uct_answers`
    );

    const totalResponses = Number(totals.total_responses);
    const likeUct         = Number(totals.like_uct);
    const wantChanges      = Number(totals.want_changes);
    const dislike          = Number(totals.dislike);
    const sentimentScore   = likeUct - dislike;
    const avgRating        = totals.avg_rating ? Number(Number(totals.avg_rating).toFixed(1)) : 0;

    const pct = (count) => totalResponses > 0 ? Number(((count / totalResponses) * 100).toFixed(1)) : 0;

    /* ── Last period comparison (likes up/down) ──
       "Last period" = previous 30-day window before current 30 days */
    const [[lastPeriod]] = await db.execute(
      `SELECT
         SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q1')) = 'like_uct' THEN 1 ELSE 0 END) AS like_uct
       FROM uct_answers
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
         AND created_at <  DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    const likesVsLastPeriod = likeUct - Number(lastPeriod.like_uct || 0);

    /* ── Most-requested changes (q2 is a JSON array, from users who want_changes) ──
       MySQL JSON_TABLE to explode array values into rows */
    const [changeRows] = await db.execute(
      `SELECT jt.change_item
       FROM uct_answers a,
            JSON_TABLE(
              a.answers->'$.q2',
              '$[*]' COLUMNS (change_item VARCHAR(100) PATH '$')
            ) AS jt
       WHERE JSON_UNQUOTE(JSON_EXTRACT(a.answers, '$.q1')) = 'like_changes'`
    );

    const changeCounts = {};
    for (const row of changeRows) {
      changeCounts[row.change_item] = (changeCounts[row.change_item] || 0) + 1;
    }

    const changeLabels = {
      more_leagues:        "More leagues / series",
      faster_generation:   "Faster team generation",
      better_coins:        "Cheaper coin packs",
      smarter_selection:   "Smarter team selection",
      add_sports:          "Add more sports",
      ui_improvements:     "Website / UI improvements",
      remove_sub_mandate:  "Remove Sub, Mandate options",
      custom_players:      "Let me choose my 18-22 players to generate teams",
    };

    const maxChangeCount = Math.max(1, ...Object.values(changeCounts));

    const mostRequestedChanges = Object.entries(changeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label:        changeLabels[key] || key,
        users:        count,
        pct_of_top:   Number(((count / maxChangeCount) * 100).toFixed(1)),
        pct_of_wantchanges: wantChanges > 0 ? Number(((count / wantChanges) * 100).toFixed(1)) : 0,
      }));

    return res.status(200).json({
      success: true,

      kpis: {
        feedback_responses: totalResponses,
        like_uct:    { count: likeUct,      pct: pct(likeUct) },
        want_changes:{ count: wantChanges,  pct: pct(wantChanges) },
        dislike:     { count: dislike,      pct: pct(dislike) },
      },

      insight: {
        sentiment_score:        sentimentScore,
        likes_vs_last_period:   likesVsLastPeriod,
        trend:                  likesVsLastPeriod >= 0 ? "gaining" : "declining",
        avg_rating:              avgRating,
      },

      how_users_feel: {
        like_uct_pct: pct(likeUct),
        breakdown: [
          { label: "Like UCT",      count: likeUct,      pct: pct(likeUct) },
          { label: "Want changes",  count: wantChanges,  pct: pct(wantChanges) },
          { label: "Dislike",       count: dislike,      pct: pct(dislike) },
        ],
      },

      most_requested_changes: mostRequestedChanges,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. RECENT FEEDBACK LIST
   GET /admin/feedback/votes-list?vote=like_uct|like_changes|dislike
                                  &page=1&limit=20
   Section: Recent feedback table (filterable, paginated)
   ═══════════════════════════════════════════════════ */
export const getVotesList = async (req, res) => {
  try {
    const { vote = "", page = 1, limit = 20 } = req.query;
    const limitNum  = Number(limit);
    const offsetNum = (Number(page) - 1) * limitNum;

    const conditions = [];
    const params      = [];

    if (vote) {
      conditions.push(`JSON_UNQUOTE(JSON_EXTRACT(a.answers, '$.q1')) = ?`);
      params.push(vote);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await db.execute(
      `SELECT
         a.id,
         a.created_at,
         u.fullname,
         u.country,
         JSON_UNQUOTE(JSON_EXTRACT(a.answers, '$.q1'))  AS vote,
         JSON_UNQUOTE(JSON_EXTRACT(a.answers, '$.q10')) AS comment,
         CAST(JSON_UNQUOTE(JSON_EXTRACT(a.answers, '$.q11')) AS DECIMAL(3,1)) AS rating
       FROM uct_answers a
       JOIN users u ON u.id = a.user_id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM uct_answers a
       ${whereClause}`,
      params
    );

    const voteLabel = {
      like_uct:      "Like UCT",
      like_changes:  "Want changes",
      dislike:       "Dislike",
    };

    return res.status(200).json({
      success: true,
      pagination: {
        total:       Number(total),
        page:        Number(page),
        limit:       limitNum,
        total_pages: Math.ceil(Number(total) / limitNum),
      },
      filters: { vote },
      feedback: rows.map((r) => ({
        id:        r.id,
        feedback_code: `FB-${r.id}`,
        fullname:  r.fullname,
        region:    r.country,
        vote:      r.vote,
        vote_label: voteLabel[r.vote] || r.vote,
        rating:    r.rating ? Number(r.rating) : null,
        comment:   r.comment,
        date:      r.created_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


 

/* ═══════════════════════════════════════════════════
   GET /admin/reports/coin-packs
   Sections: KPI cards, Coin pack table with USD/INR value & share
   ═══════════════════════════════════════════════════ */
export const getCoinPacksReport = async (req, res) => {
  try {

    const usdToInr = 95.36; // TODO: replace with live FX rate source if available

    /* ── Per-pack stats: price, users purchased, value ── */
    const [packs] = await db.execute(
      `SELECT
         sp.id,
         sp.name,
         sp.coins,
         sp.price                          AS price_usd,
         COUNT(us.id)                      AS users_purchased,
         COALESCE(SUM(us.amount), 0)       AS value_usd
       FROM subscription_plans sp
       LEFT JOIN user_subscriptions us ON us.plan_id = sp.id AND us.amount > 0
       GROUP BY sp.id, sp.name, sp.coins, sp.price
       ORDER BY sp.price ASC`
    );

    const totalPurchases = packs.reduce((s, p) => s + Number(p.users_purchased), 0);
    const totalValueUsd  = packs.reduce((s, p) => s + Number(p.value_usd), 0);

    const packList = packs.map((p) => ({
      id:              p.id,
      name:            p.name,
      coins:           Number(p.coins),
      price_usd:       Number(p.price_usd).toFixed(2),
      users_purchased: Number(p.users_purchased),
      value_usd:       Number(p.value_usd).toFixed(2),
      value_inr:       (Number(p.value_usd) * usdToInr).toFixed(2),
      share_pct:       totalValueUsd > 0
        ? Number(((Number(p.value_usd) / totalValueUsd) * 100).toFixed(1))
        : 0,
    }));

    return res.status(200).json({
      success: true,

      kpis: {
        coin_packs_count:  packList.length,
        total_purchases:   totalPurchases,
        total_value_usd:   totalValueUsd.toFixed(2),
        total_value_inr:   (totalValueUsd * usdToInr).toFixed(2),
        usd_to_inr_rate:   usdToInr,
      },

      packs: packList,

      totals: {
        users_purchased: totalPurchases,
        value_usd:       totalValueUsd.toFixed(2),
        value_inr:       (totalValueUsd * usdToInr).toFixed(2),
        share_pct:       100,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
 

/* ═══════════════════════════════════════════════════
   TABLE: leagues_catalog
   id, name, region, tier, matches_30d, is_visible, created_at
   ═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   1. LIST + KPIs
   GET /admin/leagues
   ═══════════════════════════════════════════════════ */
export const getLeagues = async (req, res) => {
  try {

    const [leagues] = await db.execute(
      `SELECT id, name, region, tier, matches_30d, is_visible, created_at
       FROM leagues_catalog
       ORDER BY id ASC`
    );

    const totalLeagues  = leagues.length;
    const shownCount    = leagues.filter((l) => l.is_visible === 1).length;
    const hiddenCount   = totalLeagues - shownCount;
    const totalMatches  = leagues
      .filter((l) => l.is_visible === 1)
      .reduce((s, l) => s + Number(l.matches_30d || 0), 0);

    return res.status(200).json({
      success: true,

      kpis: {
        total_leagues:  totalLeagues,
        shown_on_website: shownCount,
        hidden:           hiddenCount,
        matches_30d:      totalMatches,
      },

      leagues: leagues.map((l) => ({
        id:           l.id,
        league_code:  `LG-${String(l.id).padStart(2, "0")}`,
        name:         l.name,
        region:       l.region,
        tier:         l.tier,
        matches_30d:  Number(l.matches_30d || 0),
        is_visible:   l.is_visible === 1,
        created_at:   l.created_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. ADD LEAGUE
   POST /admin/leagues
   body: { name, region, tier, matches_30d }
   ═══════════════════════════════════════════════════ */
export const addLeague = async (req, res) => {
  try {
    const { name, region, tier, matches_30d } = req.body;

    if (!name?.trim() || !region?.trim() || !tier?.trim()) {
      return res.status(400).json({ success: false, message: "name, region, tier required" });
    }

    const [result] = await db.execute(
      `INSERT INTO leagues_catalog (name, region, tier, matches_30d, is_visible)
       VALUES (?, ?, ?, ?, 1)`,
      [name.trim(), region.trim(), tier.trim(), Number(matches_30d) || 0]
    );

    return res.status(200).json({
      success: true,
      message: "League added successfully",
      id: result.insertId,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   3. EDIT LEAGUE
   PATCH /admin/leagues/:id
   body: { name, region, tier, matches_30d }
   ═══════════════════════════════════════════════════ */
export const editLeague = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, region, tier, matches_30d } = req.body;

    await db.execute(
      `UPDATE leagues_catalog
       SET name = ?, region = ?, tier = ?, matches_30d = ?
       WHERE id = ?`,
      [name.trim(), region.trim(), tier.trim(), Number(matches_30d) || 0, id]
    );

    return res.status(200).json({ success: true, message: "League updated successfully" });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   4. TOGGLE VISIBILITY (shown/hidden on website)
   PATCH /admin/leagues/:id/toggle-visibility
   ═══════════════════════════════════════════════════ */
export const toggleLeagueVisibility = async (req, res) => {
  try {
    const { id } = req.params;

    const [[league]] = await db.execute(
      `SELECT is_visible FROM leagues_catalog WHERE id = ?`,
      [id]
    );

    if (!league) {
      return res.status(404).json({ success: false, message: "League not found" });
    }

    const newVisibility = league.is_visible === 1 ? 0 : 1;

    await db.execute(
      `UPDATE leagues_catalog SET is_visible = ? WHERE id = ?`,
      [newVisibility, id]
    );

    return res.status(200).json({
      success: true,
      message: `League is now ${newVisibility === 1 ? "shown" : "hidden"} on website`,
      is_visible: newVisibility === 1,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   5. DELETE LEAGUE
   DELETE /admin/leagues/:id
   ═══════════════════════════════════════════════════ */
export const deleteLeague = async (req, res) => {
  try {
    const { id } = req.params;

    await db.execute(`DELETE FROM leagues_catalog WHERE id = ?`, [id]);

    return res.status(200).json({ success: true, message: "League deleted successfully" });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};