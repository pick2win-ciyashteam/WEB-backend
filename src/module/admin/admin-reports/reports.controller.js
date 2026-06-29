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

    /* pack status (active = has a currently-valid pack, idle = no pack) */
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
           SELECT 1 FROM user_subscriptions us
           WHERE us.user_id = u.id AND us.status = 'active' AND us.expiry_date > NOW()
         )`
      );
    } else if (status === "deleted") {
      conditions.push(`CAST(u.account_status AS CHAR) = 'deleted'`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    /* ── Main list ──
       current_pack = the latest subscription row that is still active+unexpired
       (NOT all historical packs, only the one currently in effect) */
    const [users] = await db.execute(
      `SELECT
         u.id,
         u.fullname,
         u.email,
         u.country,
         u.account_status,
         u.created_at,
         COALESCE(uc.available_coins, 0) AS coins,
         cp.plan_name                     AS current_pack
       FROM users u
       LEFT JOIN user_coins uc ON uc.user_id = u.id
       LEFT JOIN (
         SELECT us1.*
         FROM user_subscriptions us1
         INNER JOIN (
           SELECT user_id, MAX(id) AS max_id
           FROM user_subscriptions
           WHERE status = 'active' AND expiry_date > NOW()
           GROUP BY user_id
         ) us2 ON us2.user_id = us1.user_id AND us2.max_id = us1.id
       ) cp ON cp.user_id = u.id
       ${whereClause}
       ORDER BY u.id DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    /* ── Total count ── */
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
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
                 SELECT 1 FROM user_subscriptions us
                 WHERE us.user_id = users.id AND us.status = 'active' AND us.expiry_date > NOW()
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
        current_pack:    u.current_pack || "No pack",
        coins:           Number(u.coins),
        joined:          u.created_at,
        account_status:  u.account_status,                          // active | suspended | deleted
        pack_status:      u.current_pack ? "active" : "idle",          // active | idle
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   SUSPEND / ACTIVATE USER ACCOUNT
   PATCH /admin/users/:id/account-status
   body: { account_status: "active" | "suspended" }
   ═══════════════════════════════════════════════════ */
export const updateUserAccountStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { account_status } = req.body;

    const allowedStatuses = ["active", "blocked"];
    if (!allowedStatuses.includes(account_status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid account_status. Allowed: ${allowedStatuses.join(", ")}`,
      });
    }

    const [[user]] = await db.execute(
      `SELECT id, account_status FROM users WHERE id = ?`,
      [id]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (String(user.account_status) === "deleted") {
      return res.status(400).json({ success: false, message: "Cannot change status of a deleted account" });
    }

    await db.execute(
      `UPDATE users SET account_status = ? WHERE id = ?`,
      [account_status, id]
    );

    return res.status(200).json({
      success: true,
      message: account_status === "suspended"
        ? "User account suspended"
        : "User account activated",
      account_status,
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

    /* Only 3 valid window values accepted */
    const validWindows = ["15d", "30d", "expired"];
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
   1. VOTES SURVEY — SUMMARY (Q1–Q9, Q11 aggregated, Q6 top free-text)
   GET /admin/feedback/votes/summary
   ═══════════════════════════════════════════════════ */
export const getVotesSurveySummary = async (req, res) => {
  try {

    const [[totals]] = await db.execute(
      `SELECT
         COUNT(*) AS total_responses,
         SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q1')) = 'like_uct'     THEN 1 ELSE 0 END) AS like_uct,
         SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q1')) = 'like_changes' THEN 1 ELSE 0 END) AS like_changes,
         SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q1')) = 'dislike'      THEN 1 ELSE 0 END) AS dislike,
         SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q4')) = 'very_likely'  THEN 1 ELSE 0 END) AS would_recommend,
         AVG(CAST(JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q11')) AS DECIMAL(3,1)))     AS avg_rating
       FROM uct_answers`
    );

    const totalResponses = Number(totals.total_responses);
    const likeUct         = Number(totals.like_uct);
    const likeChanges      = Number(totals.like_changes);
    const dislike          = Number(totals.dislike);
    const wouldRecommend   = Number(totals.would_recommend);
    const avgRating        = totals.avg_rating ? Number(Number(totals.avg_rating).toFixed(1)) : 0;

    const pct = (count, base = totalResponses) =>
      base > 0 ? Number(((count / base) * 100).toFixed(1)) : 0;

    /* ── last-period comparison (prev 30d window vs current 30d) ── */
    const [[lastPeriod]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM uct_answers
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
         AND created_at <  DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    const [[currentPeriod]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM uct_answers
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    const responsesVsLastPeriod = Number(currentPeriod.total) - Number(lastPeriod.total);

    /* ── helper: count single-select option frequencies for a question ── */
    const countSingleSelect = async (qKey) => {
      const [rows] = await db.execute(
        `SELECT
           JSON_UNQUOTE(JSON_EXTRACT(answers, '$.${qKey}')) AS val,
           COUNT(*) AS cnt
         FROM uct_answers
         WHERE JSON_EXTRACT(answers, '$.${qKey}') IS NOT NULL
         GROUP BY val
         ORDER BY cnt DESC`
      );
      return rows;
    };

    /* ── helper: explode multi-select JSON array question ── */
    const countMultiSelect = async (qKey, whereClause = "") => {
      const [rows] = await db.execute(
        `SELECT jt.val, COUNT(*) AS cnt
         FROM uct_answers a,
              JSON_TABLE(
                a.answers->'$.${qKey}',
                '$[*]' COLUMNS (val VARCHAR(100) PATH '$')
              ) AS jt
         ${whereClause}
         GROUP BY jt.val
         ORDER BY cnt DESC`
      );
      return rows;
    };

    /* ── Q1 — overall feeling (donut) ── */
    const q1 = {
      label: "Overall feeling about UCT",
      like_uct_pct: pct(likeUct),
      breakdown: [
        { key: "like_uct",     label: "Like UCT",          count: likeUct,    pct: pct(likeUct) },
        { key: "like_changes", label: "Like it, want changes", count: likeChanges, pct: pct(likeChanges) },
        { key: "dislike",      label: "Dislike",           count: dislike,    pct: pct(dislike) },
      ],
    };

    /* ── Q2 — most-requested improvements (multi-select) ── */
    const q2ChangeLabels = {
      more_leagues:      "More leagues / series",
      custom_players:     "Let me choose my 18-22 players",
      add_sports:         "Add more sports",
      better_coins:       "Better coin packs",
      ui_improvements:    "Website / UI improvements",
      remove_sub_mandate: "Remove Sub, Mandate options",
    };
    const q2Rows = await countMultiSelect("q2");
    const q2 = {
      label: "Most-requested improvements",
      options: q2Rows.map((r) => ({
        key:   r.val,
        label: q2ChangeLabels[r.val] || r.val,
        count: Number(r.cnt),
        pct:   pct(Number(r.cnt)),
      })),
    };

    /* ── Q3 — how often they use PICK2WIN ── */
    const q3Labels = {
      every_matchday: "Every matchday",
      few_times_week: "A few times a week",
      very_rare:      "Very rare",
      only_fifa_wc:   "Only FIFA WC",
    };
    const q3Rows = await countSingleSelect("q3");
    const q3 = {
      label: "How often they use PICK2WIN",
      options: q3Rows.map((r) => ({
        key:   r.val,
        label: q3Labels[r.val] || r.val,
        count: Number(r.cnt),
        pct:   pct(Number(r.cnt)),
      })),
    };

    /* ── Q4 — likely to recommend ── */
    const q4Labels = { very_likely: "Very likely", maybe: "Maybe", unlikely: "Unlikely" };
    const q4Rows = await countSingleSelect("q4");
    const q4 = {
      label: "Likely to recommend",
      options: q4Rows.map((r) => ({
        key:   r.val,
        label: q4Labels[r.val] || r.val,
        count: Number(r.cnt),
        pct:   pct(Number(r.cnt)),
      })),
    };

    /* ── Q5 — teams needed per match ── */
    const q5Rows = await countSingleSelect("q5");
    const q5 = {
      label: "Teams needed per match",
      options: q5Rows.map((r) => ({
        key:   r.val,
        label: `${r.val} teams`,
        count: Number(r.cnt),
        pct:   pct(Number(r.cnt)),
      })),
    };

    /* ── Q6 — competitions to add/expand (free text, top requested) ── */
    const [q6Rows] = await db.execute(
      `SELECT
         TRIM(JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q6'))) AS val,
         COUNT(*) AS cnt
       FROM uct_answers
       WHERE JSON_EXTRACT(answers, '$.q6') IS NOT NULL
         AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q6'))) != ''
       GROUP BY val
       ORDER BY cnt DESC
       LIMIT 10`
    );
    const q6 = {
      label: "Competitions to add / expand (free text)",
      top_requested: q6Rows.map((r) => ({ text: r.val, count: Number(r.cnt) })),
    };

    /* ── Q7 — which new sport first ── */
    const q7Labels = {
      cricket:           "Cricket",
      basketball:         "Basketball",
      american_football:  "American football",
      baseball:           "Baseball",
      football_only:      "Football only is fine",
    };
    const q7Rows = await countSingleSelect("q7");
    const q7 = {
      label: "Which new sport first",
      options: q7Rows.map((r) => ({
        key:   r.val,
        label: q7Labels[r.val] || r.val,
        count: Number(r.cnt),
        pct:   pct(Number(r.cnt)),
      })),
    };

    /* ── Q8 — preferred pricing ── */
    const q8Labels = {
      current_coin_packs:    "Current Coin Packs",
      league_series_packs:    "League / Series basis packs",
      pay_per_match:           "Pay per match (coins)",
      monthly_subscription:   "Monthly subscription",
    };
    const q8Rows = await countSingleSelect("q8");
    const q8 = {
      label: "Preferred pricing",
      options: q8Rows.map((r) => ({
        key:   r.val,
        label: q8Labels[r.val] || r.val,
        count: Number(r.cnt),
        pct:   pct(Number(r.cnt)),
      })),
    };

    /* ── Q9 — where they mostly play (device) ── */
    const q9Labels = { mobile_browser: "Mobile browser", desktop: "Desktop" };
    const q9Rows = await countSingleSelect("q9");
    const q9 = {
      label: "Where they mostly play",
      options: q9Rows.map((r) => ({
        key:   r.val,
        label: q9Labels[r.val] || r.val,
        count: Number(r.cnt),
        pct:   pct(Number(r.cnt)),
      })),
    };

    /* ── Q11 — UCT rating distribution (1-5 stars) ── */
    const [q11Rows] = await db.execute(
      `SELECT
         CAST(JSON_UNQUOTE(JSON_EXTRACT(answers, '$.q11')) AS UNSIGNED) AS stars,
         COUNT(*) AS cnt
       FROM uct_answers
       WHERE JSON_EXTRACT(answers, '$.q11') IS NOT NULL
       GROUP BY stars
       ORDER BY stars DESC`
    );
    const q11 = {
      label: "UCT rating (1=poor, 5=excellent)",
      avg_rating: avgRating,
      distribution: q11Rows.map((r) => ({
        stars: Number(r.stars),
        count: Number(r.cnt),
        pct:   pct(Number(r.cnt)),
      })),
    };

    return res.status(200).json({
      success: true,

      kpis: {
        total_responses:  totalResponses,
        avg_uct_rating:   avgRating,
        like_uct:         { count: likeUct,       pct: pct(likeUct) },
        would_recommend:  { count: wouldRecommend, pct: pct(wouldRecommend) },
      },

      insight: {
        responses_vs_last_period: responsesVsLastPeriod,
        like_uct_pct:    pct(likeUct),
        would_recommend_pct: pct(wouldRecommend),
        avg_rating:      avgRating,
        top_ask:         q2.options[0] ? q2.options[0].label : null,
      },

      q1_overall_feeling:        q1,
      q2_most_requested:         q2,
      q3_usage_frequency:        q3,
      q4_recommend_likelihood:   q4,
      q5_teams_per_match:        q5,
      q6_competitions_requested: q6,
      q7_next_sport:             q7,
      q8_preferred_pricing:      q8,
      q9_device:                 q9,
      q11_rating:                q11,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. VOTES SURVEY — RECENT SUBMISSIONS LIST (Q10 table)
   GET /admin/feedback/votes/list?vote=like_uct|like_changes|dislike
                                  &page=1&limit=20
   ═══════════════════════════════════════════════════ */
export const getVotesSurveyList = async (req, res) => {
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
         CAST(JSON_UNQUOTE(JSON_EXTRACT(a.answers, '$.q11')) AS DECIMAL(3,1)) AS rating,
         JSON_UNQUOTE(JSON_EXTRACT(a.answers, '$.q3'))  AS usage_frequency,
         JSON_UNQUOTE(JSON_EXTRACT(a.answers, '$.q9'))  AS device,
         JSON_UNQUOTE(JSON_EXTRACT(a.answers, '$.q10')) AS comment
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
      like_uct:     "Like UCT",
      like_changes: "Want changes",
      dislike:      "Dislike",
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
      submissions: rows.map((r) => ({
        id:              r.id,
        feedback_code:   `FB-${r.id}`,
        fullname:        r.fullname,
        country:         r.country,
        vote:            r.vote,
        vote_label:      voteLabel[r.vote] || r.vote,
        rating:          r.rating ? Number(r.rating) : null,
        usage_frequency: r.usage_frequency,
        device:          r.device,
        comment:         r.comment,
        date:            r.created_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


 

/* ═══════════════════════════════════════════════════
   1. DETAILED FEEDBACK — SUMMARY
   GET /admin/feedback/detailed/summary
   Sections: KPI cards, By category, By importance, Where in PICK2WIN
   ═══════════════════════════════════════════════════ */
export const getDetailedFeedbackSummary = async (req, res) => {
  try {

    /* ── KPI cards ── */
    const [[kpi]] = await db.execute(
      `SELECT
         COUNT(*)                                                        AS total_submissions,
         SUM(CASE WHEN status = 'New'        THEN 1 ELSE 0 END)         AS new_unreviewed,
         SUM(CASE WHEN importance = 'Stopping me using it' THEN 1 ELSE 0 END) AS blockers,
         SUM(CASE WHEN status = 'Resolved'   THEN 1 ELSE 0 END)         AS resolved
       FROM feedbacks
       WHERE user_id IS NOT NULL`
    );

    const totalSubmissions = Number(kpi.total_submissions);
    const pct = (count) => totalSubmissions > 0 ? Number(((count / totalSubmissions) * 100).toFixed(1)) : 0;

    /* ── By category ── */
    const [categoryRows] = await db.execute(
      `SELECT type AS category, COUNT(*) AS cnt
       FROM feedbacks
       WHERE user_id IS NOT NULL
       GROUP BY type
       ORDER BY cnt DESC`
    );
    const byCategory = categoryRows.map((r) => ({
      category: r.category,
      count:    Number(r.cnt),
      pct:      pct(Number(r.cnt)),
    }));

    /* ── By importance ── */
    const [importanceRows] = await db.execute(
      `SELECT importance, COUNT(*) AS cnt
       FROM feedbacks
       WHERE user_id IS NOT NULL
       GROUP BY importance
       ORDER BY
         CASE importance
           WHEN 'Stopping me using it' THEN 1
           WHEN 'Would really help'    THEN 2
           WHEN 'Nice to have'         THEN 3
           ELSE 4
         END`
    );
    const byImportance = importanceRows.map((r) => ({
      importance: r.importance,
      count:      Number(r.cnt),
      pct:        pct(Number(r.cnt)),
    }));

    /* ── Where in PICK2WIN (location) ── */
    const [locationRows] = await db.execute(
      `SELECT location, COUNT(*) AS cnt
       FROM feedbacks
       WHERE user_id IS NOT NULL
       GROUP BY location
       ORDER BY cnt DESC`
    );
    const byLocation = locationRows.map((r) => ({
      location: r.location,
      count:    Number(r.cnt),
      pct:      pct(Number(r.cnt)),
    }));

    return res.status(200).json({
      success: true,

      kpis: {
        total_submissions: totalSubmissions,
        new_unreviewed:    Number(kpi.new_unreviewed),
        blockers:          Number(kpi.blockers),
        resolved:          Number(kpi.resolved),
      },

      by_category:   byCategory,
      by_importance: byImportance,
      by_location:   byLocation,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. DETAILED FEEDBACK — SUBMISSIONS LIST
   GET /admin/feedback/detailed/list?status=New|Reviewing|Planned|Resolved|Declined
                                     &page=1&limit=20
   Section: Submissions inbox table
   ═══════════════════════════════════════════════════ */
export const getDetailedFeedbackList = async (req, res) => {
  try {
    const { status = "", page = 1, limit = 20 } = req.query;
    const limitNum  = Number(limit);
    const offsetNum = (Number(page) - 1) * limitNum;

    const conditions = ["f.user_id IS NOT NULL"];
    const params      = [];

    if (status) {
      conditions.push(`f.status = ?`);
      params.push(status);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [rows] = await db.execute(
      `SELECT
         f.id,
         f.type        AS category,
         f.subject,
         f.message      AS suggestion,
         f.importance,
         f.location,
         f.email,
         f.status,
         f.created_at,
         u.fullname,
         u.email AS user_email
       FROM feedbacks f
       JOIN users u ON u.id = f.user_id
       ${whereClause}
       ORDER BY f.created_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM feedbacks f
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
      filters: { status },
      submissions: rows.map((r) => ({
        id:          r.id,
        category:    r.category,
        subject:     r.subject,
        suggestion:  r.suggestion,
        importance:  r.importance,
        location:    r.location,
        from_name:   r.fullname,
        from_email:  r.email || r.user_email,
        status:      r.status,
        date:        r.created_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   3. UPDATE SUBMISSION STATUS (status dropdown on each row)
   PATCH /admin/feedback/detailed/:id/status
   body: { status: "New" | "Reviewing" | "Planned" | "Resolved" | "Declined" }
   ═══════════════════════════════════════════════════ */
export const updateDetailedFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["New", "Reviewing", "Planned", "Resolved", "Declined"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}`,
      });
    }

    await db.execute(`UPDATE feedbacks SET status = ? WHERE id = ?`, [status, id]);

    return res.status(200).json({ success: true, message: "Status updated successfully" });
 
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

 

/* ═══════════════════════════════════════════════════
   1. PURCHASES SUMMARY
   GET /admin/coin-packs/purchases?period=today|monthly|yearly&month=6&year=2026
   Sections: KPI cards, Coin pack purchases table (per period)
   ═══════════════════════════════════════════════════ */


//Today

// http://localhost:3000/api/admin/reports/coin-packs?period=today

//Monthly (June 2026)

// http://localhost:3000/api/admin/reports/coin-packs?period=monthly&month=6&year=2026


// Yearly (FY 2026-27)

// http://localhost:3000/api/admin/reports/coin-packs?period=yearly&year=2026

export const getCoinPackPurchases = async (req, res) => {
  try {
    const { period = "today", month, year } = req.query;
 
    const validPeriods = ["today", "monthly", "yearly"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: `Invalid period. Allowed: ${validPeriods.join(", ")}`,
      });
    }
 
    const today = new Date();
    const targetMonth = month ? Number(month) : today.getMonth() + 1;
    const targetYear  = year  ? Number(year)  : today.getFullYear();
 
    /* ── KPI cards: purchased today, this month MTD, all-time ── */
    const [[kpiToday]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM user_subscriptions
       WHERE amount > 0
         AND DATE(created_at) = CURDATE()`
    );
 
    const [[kpiMtd]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM user_subscriptions
       WHERE amount > 0
         AND MONTH(created_at) = MONTH(NOW())
         AND YEAR(created_at)  = YEAR(NOW())`  
    );
 
    const [[kpiAllTime]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM user_subscriptions
       WHERE amount > 0`
    );
 
    /* ── Resolve date range based on selected period ── */
    let dateCondition, periodLabel;
    const params = [];
 
    if (period === "today") {
      dateCondition = `DATE(us.created_at) = CURDATE()`;
      periodLabel = `Today`;
    } else if (period === "monthly") {
      dateCondition = `MONTH(us.created_at) = ? AND YEAR(us.created_at) = ?`;
      params.push(targetMonth, targetYear);
      const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      periodLabel = `${monthNames[targetMonth]} ${targetYear}`;
    } else {
      /* yearly = Indian FY: Apr 1 - Mar 31 */
      dateCondition = `us.created_at >= ? AND us.created_at < ?`;
      params.push(`${targetYear}-04-01`, `${targetYear + 1}-04-01`);
      periodLabel = `FY ${targetYear}-${String(targetYear + 1).slice(2)}`;
    }
 
    /* ── Per-pack purchase counts for selected period ── */
    const [packs] = await db.execute(
      `SELECT
         us.plan_id,
         us.plan_name,
         MAX(sp.coins) AS coins,
         COUNT(*) AS users_purchased
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.amount > 0
         AND ${dateCondition}
       GROUP BY us.plan_id, us.plan_name
       ORDER BY MAX(sp.coins) ASC`,
      params
    );
 
    const totalPeriodPurchases = packs.reduce((s, p) => s + Number(p.users_purchased), 0);
 
    const packList = packs.map((p) => ({
      plan_id:          p.plan_id,
      name:             p.plan_name,
      coins:             Number(p.coins),
      users_purchased:  Number(p.users_purchased),
      share_pct:        totalPeriodPurchases > 0
        ? Number(((Number(p.users_purchased) / totalPeriodPurchases) * 100).toFixed(1))
        : 0,
    }));
 
    return res.status(200).json({
      success: true,
 
      kpis: {
        purchased_today:    Number(kpiToday.total),
        this_month_mtd:      Number(kpiMtd.total),
        all_time_purchases:  Number(kpiAllTime.total),
      },
 
      period: {
        type:   period,
        label:  periodLabel,
        month:  period === "monthly" ? targetMonth : null,
        year:   period !== "today" ? targetYear : null,
      },
 
      total_purchased: totalPeriodPurchases,
 
      packs: packList,
 
      totals: {
        users_purchased: totalPeriodPurchases,
        share_pct:       100,
      },
    });
 
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
 

/* ═══════════════════════════════════════════════════
   2. PACK PURCHASES BY COUNTRY
   GET /admin/coin-packs/by-country?country=&period=monthly&month=6&year=2026
   Section: Pack purchases by country table
   ═══════════════════════════════════════════════════ */

  //  http://localhost:3000/api/admin/reports/countrywise-coin?period=monthly&month=6&year=2026 

 // Monthly - India Only
 
//  http://localhost:3000/api/admin/reports/countrywise-coin?country=India&period=monthly&month=6&year=2026
 
 // Today - All Countries
 
// http://localhost:3000/api/admin/reports/countrywise-coin?period=today

// Today - India Only

// http://localhost:3000/api/admin/reports/countrywise-coin?country=India&period=today

//Yearly - All Countries
// http://localhost:3000/api/admin/reports/countrywise-coin?period=yearly&year=2026

// Yearly - India Only

// http://localhost:3000/api/admin/reports/countrywise-coin?country=India&period=yearly&year=2026


 
export const getCoinPackPurchasesByCountry = async (req, res) => {
  try {
    const { country = "", period = "monthly", month, year } = req.query;
 
    const today = new Date();
    const targetMonth = month ? Number(month) : today.getMonth() + 1;
    const targetYear  = year  ? Number(year)  : today.getFullYear();
 
    let dateCondition;
    const dateParams = [];
 
    if (period === "today") {
      dateCondition = `DATE(us.created_at) = CURDATE()`;
    } else if (period === "yearly") {
      dateCondition = `us.created_at >= ? AND us.created_at < ?`;
      dateParams.push(`${targetYear}-04-01`, `${targetYear + 1}-04-01`);
    } else {
      dateCondition = `MONTH(us.created_at) = ? AND YEAR(us.created_at) = ?`;
      dateParams.push(targetMonth, targetYear);
    }
 
    const countryCondition = country ? `AND u.country = ?` : "";
    const params = country ? [...dateParams, country] : dateParams;
 
    /* ── Per-country, per-pack purchase counts ── */
    const [rows] = await db.execute(
      `SELECT
         u.country,
         us.plan_name,
         COUNT(*) AS cnt
       FROM user_subscriptions us
       JOIN users u ON u.id = us.user_id
       WHERE us.amount > 0
         AND ${dateCondition}
         ${countryCondition}
       GROUP BY u.country, us.plan_name`,
      params
    );
 
    /* ── Pivot into { country: { Starter: x, Basic: y, ... } } ── */
    const countryMap = {};
    for (const row of rows) {
      if (!countryMap[row.country]) countryMap[row.country] = {};
      countryMap[row.country][row.plan_name] = Number(row.cnt);
    }
 
    const byCountry = Object.entries(countryMap).map(([countryName, packs]) => {
      const total = Object.values(packs).reduce((s, v) => s + v, 0);
      return {
        country: countryName,
        packs,
        total,
      };
    }).sort((a, b) => b.total - a.total);
 
    /* ── Grand totals per pack across all countries ── */
    const grandTotals = {};
    let grandTotal = 0;
    for (const c of byCountry) {
      for (const [packName, count] of Object.entries(c.packs)) {
        grandTotals[packName] = (grandTotals[packName] || 0) + count;
      }
      grandTotal += c.total;
    }
 
    return res.status(200).json({
      success: true,
      filters: { country, period, month: targetMonth, year: targetYear },
      total_countries: byCountry.length,
      by_country: byCountry,
      totals: {
        packs: grandTotals,
        total: grandTotal,
      },
    });
 
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
 

/* ═══════════════════════════════════════════════════
   GET /admin/series?status=all|live|upcoming|completed
   Sections: KPI cards, Series table (live/upcoming/completed history)
   ═══════════════════════════════════════════════════ */
export const getAdminSeries = async (req, res) => {
  try {
    const { status = "all" } = req.query;

    const validStatuses = ["all", "live", "upcoming", "completed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${validStatuses.join(", ")}`,
      });
    }

    /* ── KPI: Leagues on website (from leagues_catalog) ── */
    const [[leaguesKpi]] = await db.execute(
      `SELECT
         COUNT(*)                                              AS total_leagues,
         SUM(CASE WHEN is_visible = 1 THEN 1 ELSE 0 END)      AS enabled_leagues
       FROM leagues_catalog`
    );

    /* ── Per-series aggregated stats: matches, participants, ucts, derived status ──
       series.status = catalog active/inactive flag (NOT live/upcoming/completed)
       Live/Upcoming/Completed derived from matches.status per match in this series */
    const [seriesRows] = await db.execute(
      `SELECT
         s.id,
         s.seriesid,
         s.name,
         s.category,
         s.country_name,
         s.start_date     AS series_start_date,
         s.end_date        AS series_end_date,

         COUNT(DISTINCT m.id)           AS total_matches,
         COUNT(DISTINCT mgl.user_id)    AS participants,
         COUNT(DISTINCT mgl.id)         AS ucts_used,

         MIN(m.start_time) AS first_match_date,
         MAX(m.start_time) AS last_match_date,

         /* derive status — use series dates if available, fallback to match dates */
         CASE
           WHEN COALESCE(s.start_date, MIN(m.start_time)) > NOW()
             THEN 'Upcoming'
           WHEN COALESCE(s.start_date, MIN(m.start_time)) <= NOW()
            AND COALESCE(s.end_date,   MAX(m.start_time)) >= NOW()
             THEN 'Live'
           ELSE 'Completed'
         END AS derived_status

       FROM series s
       LEFT JOIN matches m                ON m.series_id = s.seriesid AND m.is_active = 1
       LEFT JOIN match_generation_log mgl ON mgl.match_id = m.id

       WHERE s.status = 'active'
       GROUP BY s.id, s.seriesid, s.name, s.category, s.country_name,
                s.start_date, s.end_date
       ORDER BY s.start_date DESC`
    );

    const seriesWithStatus = seriesRows;

    const filterMap = { live: "Live", upcoming: "Upcoming", completed: "Completed" };
    const filtered = status === "all"
      ? seriesWithStatus
      : seriesWithStatus.filter((s) => s.derived_status === filterMap[status]);

    const counts = {
      all:       seriesWithStatus.length,
      live:      seriesWithStatus.filter((s) => s.derived_status === "Live").length,
      upcoming:  seriesWithStatus.filter((s) => s.derived_status === "Upcoming").length,
      completed: seriesWithStatus.filter((s) => s.derived_status === "Completed").length,
    };

    /* ── KPI: series completed all-time, live now, upcoming next ── */
    const kpis = {
      leagues_on_website: {
        enabled: Number(leaguesKpi.enabled_leagues),
        total:   Number(leaguesKpi.total_leagues),
      },
      series_completed:  counts.completed,
      live_series:        counts.live,
      upcoming_series:    counts.upcoming,
    };

    /* ── Totals row (run-to-date, across filtered set) ── */
    const totals = filtered.reduce(
      (acc, s) => {
        acc.matches      += Number(s.total_matches);
        acc.participants  += Number(s.participants);
        acc.ucts_used      += Number(s.ucts_used);
        return acc;
      },
      { matches: 0, participants: 0, ucts_used: 0 }
    );

    /* ── Total UCTs across completed series only (for subtitle) ── */
    const uctsCompletedSeries = seriesWithStatus
      .filter((s) => s.derived_status === "Completed")
      .reduce((s, r) => s + Number(r.ucts_used), 0);

    return res.status(200).json({
      success: true,

      kpis,

      tab_counts: counts,

      series_list: {
        total:                filtered.length,
        completed_count:      counts.completed,
        live_count:           counts.live,
        upcoming_count:       counts.upcoming,
        ucts_across_completed: uctsCompletedSeries,

        series: filtered.map((s) => ({
          id:           s.id,
          series_code:  `SR-${s.seriesid}`,
          name:         s.name,
          league:       s.country_name || s.name,

          /* series catalog window (from series.start_date / end_date) */
          series_window: {
            start_date: s.series_start_date,
            end_date:   s.series_end_date,
          },

          /* actual match dates derived from matches.start_time */
          match_window: {
            first_match_date: s.first_match_date,
            last_match_date:  s.last_match_date,
          },

          matches:       Number(s.total_matches),
          participants:  Number(s.participants) || null,
          ucts_used:     Number(s.ucts_used) || null,
          status:        s.derived_status,
        })),

        totals: {
          matches:      totals.matches,
          participants:  totals.participants,
          ucts_used:      totals.ucts_used,
        },
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   TABLE: leagues_catalog
   id, name, short_name, region, tier, from_month_year, to_month_year,
   description, matches_30d, is_visible, created_at
   ═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   1. LIST + KPIs
   GET /admin/leagues
   ═══════════════════════════════════════════════════ */
export const getLeagues = async (req, res) => {
  try {

    const [leagues] = await db.execute(
      `SELECT id, name, short_name, region, tier, from_month_year, to_month_year,
              description, matches_30d, is_visible, created_at
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
        short_name:   l.short_name,
        region:       l.region,
        tier:         l.tier,
        from_month_year: l.from_month_year,
        to_month_year:   l.to_month_year,
        description:  l.description,
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
   body: { name, short_name, region, tier, from_month_year, to_month_year, description, matches_30d }
   ═══════════════════════════════════════════════════ */
export const addLeague = async (req, res) => {
  try {
    const {
      name,
      short_name,
      region,
      tier,
      from_month_year,
      to_month_year,
      description,
      matches_30d,
    } = req.body;

    if (!name?.trim() || !region?.trim() ) {
      return res.status(400).json({ success: false, message: "name, region, required" });
    }

    const [result] = await db.execute(
      `INSERT INTO leagues_catalog
         (name, short_name, region, tier, from_month_year, to_month_year,
          description, matches_30d, is_visible)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        name.trim(),
        short_name?.trim() || null,
        region.trim(),
        tier?.trim() || null,
        from_month_year?.trim() || null,
        to_month_year?.trim() || null,
        description?.trim() || null,
        Number(matches_30d) || 0,
      ]
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
   body: { name, short_name, region, tier, from_month_year, to_month_year, description, matches_30d }
   ═══════════════════════════════════════════════════ */

   export const editLeague = async (req, res) => {
  try {
    const { id } = req.params;

    const ALLOWED = [
      "name", "short_name", "region", "tier",
      "from_month_year", "to_month_year", "description", "matches_30d",
    ];

    const fields = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) fields[key] = req.body[key];
    }

    if (!Object.keys(fields).length)
      return res.status(400).json({ success: false, message: "No valid fields to update" });

    // sanitize
    if (fields.name)           fields.name           = fields.name.trim();
    if (fields.short_name)     fields.short_name     = fields.short_name.trim() || null;
    if (fields.region)         fields.region         = fields.region.trim();
    if (fields.tier)           fields.tier           = fields.tier.trim() || null;
    if (fields.from_month_year) fields.from_month_year = fields.from_month_year.trim() || null;
    if (fields.to_month_year)  fields.to_month_year  = fields.to_month_year.trim() || null;
    if (fields.description)    fields.description    = fields.description.trim() || null;
    if (fields.matches_30d !== undefined) fields.matches_30d = Number(fields.matches_30d) || 0;

    const setClauses = Object.keys(fields).map((k) => `${k} = ?`).join(", ");
    const setValues  = Object.values(fields);

    await db.execute(
      `UPDATE leagues_catalog SET ${setClauses} WHERE id = ?`,
      [...setValues, id]
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



//....


/* ═══════════════════════════════════════════════════
   GET /admin/activity-log?category=all|packs|finance|payments|catalog|users|admin
                           &page=1&limit=20
   Sections: KPI cards, Admin actions table (filterable by category)

   NOTE: The logAdminActivity() helper used to write into this table
   lives in /utils/activityLogger.js — import it from there inside
   any controller that performs a create/edit/delete/refund/credential
   change action.
   ═══════════════════════════════════════════════════ */

export const getActivityLog = async (req, res) => {
  try {
    const { category = "all", page = 1, limit = 20 } = req.query;

    const validCategories = ["all", "packs", "finance", "payments", "catalog", "users", "admin"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Allowed: ${validCategories.join(", ")}`,
      });
    }

    const limitNum  = Number(limit);
    const offsetNum = (Number(page) - 1) * limitNum;

    /* ── KPI cards ── */
    const [[kpi]] = await db.execute(
      `SELECT
         COUNT(*)                                                                AS total_actions,
         SUM(CASE WHEN admin_role = 'Super Admin' THEN 1 ELSE 0 END)            AS by_super_admin,
         SUM(CASE WHEN admin_role != 'Super Admin' THEN 1 ELSE 0 END)           AS by_sub_admins
       FROM admin_activity_logs`
    );

    /* ── Category counts (for tab badges, always on full set) ── */
    const [categoryRows] = await db.execute(
      `SELECT category, COUNT(*) AS cnt
       FROM admin_activity_logs
       GROUP BY category`
    );
    const categoryCounts = { all: Number(kpi.total_actions) };
    for (const cat of ["packs", "finance", "payments", "catalog", "users", "admin"]) {
      categoryCounts[cat] = 0;
    }
    for (const row of categoryRows) {
      categoryCounts[row.category] = Number(row.cnt);
    }

    /* ── Filtered list ── */
    const whereClause = category === "all" ? "" : `WHERE category = ?`;
    const params = category === "all" ? [] : [category];

    const [rows] = await db.execute(
      `SELECT id, admin_name, admin_role, category, action, details, created_at
       FROM admin_activity_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM admin_activity_logs
       ${whereClause}`,
      params
    );

    return res.status(200).json({
      success: true,

      kpis: {
        actions_logged: Number(kpi.total_actions),
        by_super_admin: Number(kpi.by_super_admin),
        by_sub_admins:  Number(kpi.by_sub_admins),
      },

      category_counts: categoryCounts,

      pagination: {
        total:       Number(total),
        page:        Number(page),
        limit:       limitNum,
        total_pages: Math.ceil(Number(total) / limitNum),
      },

      filters: { category },

      actions: rows.map((r) => ({
        id:         r.id,
        when:       r.created_at,
        admin_name: r.admin_name,
        admin_role: r.admin_role,
        category:   r.category,
        action:     r.action,
        details:    r.details,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};




/* ═══════════════════════════════════════════════════
   GET /admin/finance/revenue?tab=today|by_month|fy_report
                              &month=7&year=2026
 
   3 tabs:
   - today     : today's revenue by pack
   - by_month  : selected month revenue by pack
   - fy_report : full FY month-by-month table + by pack breakdown
 
   No share%, no INR — USD only
   ═══════════════════════════════════════════════════ */
export const getRevenue = async (req, res) => {
  try {
    const { tab = "today", month, year } = req.query;
 
    const validTabs = ["today", "by_month", "fy_report"];
    if (!validTabs.includes(tab)) {
      return res.status(400).json({
        success: false,
        message: `Invalid tab. Allowed: ${validTabs.join(", ")}`,
      });
    }
 
    const now          = new Date();
    const targetMonth  = month ? Number(month) : now.getMonth() + 1;
    const targetYear   = year  ? Number(year)  : now.getFullYear();
 
    /* ── Indian FY: Apr 1 → Mar 31 ── */
    const fyStartYear  = targetMonth >= 4 ? targetYear : targetYear - 1;
    const fyStart      = `${fyStartYear}-04-01`;
    const fyEnd        = `${fyStartYear + 1}-04-01`;
    const fyLabel      = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
 
    /* ── KPI cards (always shown, independent of tab) ── */
    const [[kpiToday]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM user_subscriptions
       WHERE amount > 0 AND DATE(created_at) = CURDATE()`
    );
 
    const [[kpiMonth]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM user_subscriptions
       WHERE amount > 0
         AND MONTH(created_at) = ? AND YEAR(created_at) = ?`,
      [targetMonth, targetYear]
    );
 
    const [[kpiFy]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM user_subscriptions
       WHERE amount > 0
         AND created_at >= ? AND created_at < ?`,
      [fyStart, fyEnd]
    );
 
    const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
 
    /* helper: per-pack revenue for a date range */
    const getPackRevenue = async (dateCondition, params) => {
      const [rows] = await db.execute(
        `SELECT
           us.plan_name,
           us.coins,
           COALESCE(SUM(us.amount), 0) AS revenue_usd
         FROM user_subscriptions us
         WHERE us.amount > 0 AND ${dateCondition}
         GROUP BY us.plan_name, us.coins
         ORDER BY us.coins ASC`,
        params
      );
 
      const totalUsd = rows.reduce((s, r) => s + Number(r.revenue_usd), 0);
 
      return {
        packs: rows.map((r) => ({
          name:        r.plan_name,
          coins:        Number(r.coins),
          revenue_usd:  Number(r.revenue_usd).toFixed(2),
        })),
        total_usd: totalUsd.toFixed(2),
      };
    };
 
    let responseData = {};
 
    /* ════════════════════
       TAB: TODAY
    ════════════════════ */
    if (tab === "today") {
      const packData = await getPackRevenue(`DATE(us.created_at) = CURDATE()`, []);
 
      responseData = {
        tab,
        label:       `Today · ${now.toISOString().slice(0, 10)}`,
        by_pack:      packData,
      };
    }
 
    /* ════════════════════
       TAB: BY MONTH
    ════════════════════ */
    else if (tab === "by_month") {
      const packData = await getPackRevenue(
        `MONTH(us.created_at) = ? AND YEAR(us.created_at) = ?`,
        [targetMonth, targetYear]
      );
 
      responseData = {
        tab,
        month:       targetMonth,
        year:         targetYear,
        label:        `${monthNames[targetMonth]} ${targetYear}`,
        by_pack:       packData,
      };
    }
 
    /* ════════════════════
       TAB: FY REPORT
    ════════════════════ */
    else {
      /* Month-by-month FY table */
      const [monthRows] = await db.execute(
        `SELECT
           MONTH(created_at) AS m,
           YEAR(created_at)  AS y,
           COALESCE(SUM(amount), 0) AS revenue_usd
         FROM user_subscriptions
         WHERE amount > 0
           AND created_at >= ? AND created_at < ?
         GROUP BY YEAR(created_at), MONTH(created_at)
         ORDER BY y ASC, m ASC`,
        [fyStart, fyEnd]
      );
 
      /* Build cumulative running total */
      let cumulative = 0;
      const fyMonths = monthRows.map((r) => {
        cumulative += Number(r.revenue_usd);
        return {
          month_label:      `${monthNames[r.m]} ${r.y}`,
          month:             Number(r.m),
          year:              Number(r.y),
          revenue_usd:       Number(r.revenue_usd).toFixed(2),
          cumulative_usd:    cumulative.toFixed(2),
        };
      });
 
      /* Per-pack breakdown for full FY */
      const packData = await getPackRevenue(
        `us.created_at >= ? AND us.created_at < ?`,
        [fyStart, fyEnd]
      );
 
      responseData = {
        tab,
        fy_label:       fyLabel,
        fy_start:        fyStart,
        fy_end:          fyEnd,
        fy_total_usd:    packData.total_usd,
        months:           fyMonths,
        by_pack:          packData,
      };
    }
 
    return res.status(200).json({
      success: true,
 
      kpis: {
        revenue_today_usd:  Number(kpiToday.total).toFixed(2),
        revenue_month_usd:  Number(kpiMonth.total).toFixed(2),
        revenue_fy_usd:      Number(kpiFy.total).toFixed(2),
        month_label:         `${monthNames[targetMonth]} ${targetYear}`,
        fy_label:             fyLabel,
      },
 
      ...responseData,
    });
 
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

 

const usdToInr = 95.36; 

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */

/* Indian FY: Apr → Mar */
const getFyRange = (year) => ({
  start: `${year}-04-01`,
  end:   `${year + 1}-04-01`,
  fyStartYear: year,
});

const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ═══════════════════════════════════════════════════
   1. GET BY MONTH
   GET /admin/finance/expenses?tab=by_month&month=4&year=2026
   Returns categories + roles with amounts for that month + FY totals
   ═══════════════════════════════════════════════════ */
export const getExpensesByMonth = async (req, res) => {
  try {
    const { month, year } = req.query;
    const now          = new Date();
    const targetMonth  = month ? Number(month) : now.getMonth() + 1;
    const targetYear   = year  ? Number(year)  : now.getFullYear();

    const fyStartYear  = targetMonth >= 4 ? targetYear : targetYear - 1;
    const { start: fyStart, end: fyEnd } = getFyRange(fyStartYear);  
    const fyLabel = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;

    /* ── Categories ── */
    const [categories] = await db.execute(
      `SELECT * FROM expense_categories ORDER BY sort_order ASC, id ASC`
    );

    /* ── Roles per category ── */
    const [roles] = await db.execute(
      `SELECT * FROM expense_roles ORDER BY id ASC`
    );

    /* ── Monthly entries for selected month ── */
    const [monthEntries] = await db.execute(
      `SELECT category_id, role_id, amount_inr
       FROM expense_entries
       WHERE month = ? AND year = ?`,
      [targetMonth, targetYear]
    );

    /* ── FY totals per category + role ── */
    const [fyEntries] = await db.execute(
      `SELECT category_id, role_id, SUM(amount_inr) AS fy_total
       FROM expense_entries
       WHERE created_at >= ? AND created_at < ?
       GROUP BY category_id, role_id`,
      [fyStart, fyEnd]
    );

    /* ── Build lookup maps ── */
    const monthMap = {};
    for (const e of monthEntries) {
      const key = `${e.category_id}_${e.role_id || "null"}`;
      monthMap[key] = Number(e.amount_inr);
    }
    const fyMap = {};
    for (const e of fyEntries) {
      const key = `${e.category_id}_${e.role_id || "null"}`;
      fyMap[key] = Number(e.fy_total);
    }

    /* ── Assemble response ── */
    let monthTotal = 0;
    let fyTotal    = 0;

    const categoryList = categories.map((cat) => {
      const catRoles = roles.filter((r) => r.category_id === cat.id);
      let catMonthAmount = 0;
      let catFyAmount    = 0;

      let rolesData = [];
      if (cat.has_roles && catRoles.length) {
        rolesData = catRoles.map((r) => {
          const mKey  = `${cat.id}_${r.id}`;
          const ma    = monthMap[mKey] || 0;
          const fa    = fyMap[mKey]    || 0;
          catMonthAmount += ma;
          catFyAmount    += fa;
          return {
            role_id:      r.id,
            name:          r.name,
            amount_inr:    ma,
            fy_total_inr:  fa,
          };
        });
      } else {
        const mKey  = `${cat.id}_null`;
        catMonthAmount = monthMap[mKey] || 0;
        catFyAmount    = fyMap[mKey]    || 0;
      }

      monthTotal += catMonthAmount;
      fyTotal    += catFyAmount;

      return {
        id:             cat.id,
        name:            cat.name,
        frequency:       cat.frequency,
        frequency_months: cat.frequency_months,
        is_auto:          Boolean(cat.is_auto),
        has_roles:        Boolean(cat.has_roles),
        amount_inr:       catMonthAmount,
        fy_total_inr:     catFyAmount,
        roles:             rolesData,
      };
    });

    /* ── KPI cards ── */
    const [[revenueMonth]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM user_subscriptions
       WHERE amount > 0 AND MONTH(created_at) = ? AND YEAR(created_at) = ?`,
      [targetMonth, targetYear]
    );

    const expenseRatioPct = Number(revenueMonth.total) > 0
      ? Number(((monthTotal / (Number(revenueMonth.total) * usdToInr)) * 100).toFixed(1))
      : 0;

    const largestCat = categoryList.reduce(
      (max, c) => c.fy_total_inr > max.fy_total_inr ? c : max,
      { name: "—", fy_total_inr: 0 }
    );

    return res.status(200).json({
      success: true,

      kpis: {
        expenses_month_inr:  monthTotal,
        expenses_fy_inr:      fyTotal,
        expense_ratio_pct:    expenseRatioPct,
        largest_cost_fy:       { name: largestCat.name, amount_inr: largestCat.fy_total_inr },
      },

      tab:         "by_month",
      month:        targetMonth,
      year:          targetYear,
      month_label:   `${monthNames[targetMonth]} ${targetYear}`,
      fy_label:       fyLabel,
      month_total_inr: monthTotal,
      fy_total_inr:    fyTotal,

      categories: categoryList,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. GET FY REPORT
   GET /admin/finance/expenses?tab=fy_report&year=2026
   Returns category-wise FY totals (donut + table)
   ═══════════════════════════════════════════════════ */
export const getExpensesFyReport = async (req, res) => {
  try {
    const { year } = req.query;
    const now = new Date();
    const fyStartYear = year ? Number(year) : (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1);
    const { start: fyStart, end: fyEnd } = getFyRange(fyStartYear);
    const fyLabel = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;

    const [fyTotals] = await db.execute(
      `SELECT ec.id, ec.name, ec.frequency, ec.is_auto,
              COALESCE(SUM(ee.amount_inr), 0) AS fy_total_inr
       FROM expense_categories ec
       LEFT JOIN expense_entries ee ON ee.category_id = ec.id
         AND ee.created_at >= ? AND ee.created_at < ?
       GROUP BY ec.id, ec.name, ec.frequency, ec.is_auto
       ORDER BY fy_total_inr DESC`,
      [fyStart, fyEnd]
    );

    const grandTotal = fyTotals.reduce((s, c) => s + Number(c.fy_total_inr), 0);

    return res.status(200).json({
      success: true,
      tab:       "fy_report",
      fy_label:   fyLabel,
      fy_start:   fyStart,
      fy_end:     fyEnd,
      total_inr:  grandTotal,
      total_usd:  (grandTotal / usdToInr).toFixed(2),

      categories: fyTotals.map((c) => ({
        id:            c.id,
        name:           c.name,
        frequency:      c.frequency,
        is_auto:         Boolean(c.is_auto),
        fy_total_inr:    Number(c.fy_total_inr),
        fy_total_usd:    (Number(c.fy_total_inr) / usdToInr).toFixed(2),
        share_pct:       grandTotal > 0
          ? Number(((Number(c.fy_total_inr) / grandTotal) * 100).toFixed(1))
          : 0,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   3. ADD CATEGORY
   POST /admin/finance/expenses/category
   body: { name, frequency, frequency_months, has_roles }
   ═══════════════════════════════════════════════════ */
export const addExpenseCategory = async (req, res) => {
  try {
    const { name, frequency = "every_month", frequency_months, has_roles = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name required" });

    const [result] = await db.execute(
      `INSERT INTO expense_categories (name, frequency, frequency_months, has_roles)
       VALUES (?, ?, ?, ?)`,
      [name.trim(), frequency, frequency_months || null, has_roles ? 1 : 0]
    );

    return res.status(200).json({ success: true, message: "Category added", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   4. DELETE CATEGORY
   DELETE /admin/finance/expenses/category/:id
   ═══════════════════════════════════════════════════ */
export const deleteExpenseCategory = async (req, res) => {
  try {
    await db.execute(`DELETE FROM expense_categories WHERE id = ?`, [req.params.id]);
    return res.status(200).json({ success: true, message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   5. ADD ROLE (under a category)
   POST /admin/finance/expenses/category/:id/role
   body: { name }
   ═══════════════════════════════════════════════════ */
export const addExpenseRole = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name required" });

    const [result] = await db.execute(
      `INSERT INTO expense_roles (category_id, name) VALUES (?, ?)`,
      [req.params.id, name.trim()]
    );

    return res.status(200).json({ success: true, message: "Role added", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   6. REMOVE ROLE
   DELETE /admin/finance/expenses/role/:id
   ═══════════════════════════════════════════════════ */
export const deleteExpenseRole = async (req, res) => {
  try {
    await db.execute(`DELETE FROM expense_roles WHERE id = ?`, [req.params.id]);
    return res.status(200).json({ success: true, message: "Role removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   7. UPSERT ENTRY (save/update monthly amount)
   PATCH /admin/finance/expenses/entry
   body: { category_id, role_id (optional), month, year, amount_inr }
   ═══════════════════════════════════════════════════ */
export const upsertExpenseEntry = async (req, res) => {
  try {
    const { category_id, role_id = null, month, year, amount_inr } = req.body;
    if (!category_id || !month || !year) {
      return res.status(400).json({ success: false, message: "category_id, month, year required" });
    }

    await db.execute(
      `INSERT INTO expense_entries (category_id, role_id, month, year, amount_inr)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE amount_inr = VALUES(amount_inr)`,
      [category_id, role_id, month, year, Number(amount_inr) || 0]
    );

    return res.status(200).json({ success: true, message: "Entry saved" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};



/* FY months in order: Apr→Mar */
const fyMonthOrder = (fyStartYear) => {
  const months = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1; // 4,5,6,7,8,9,10,11,12,1,2,3
    const y = m >= 4 ? fyStartYear : fyStartYear + 1;
    months.push({ m, y });
  }
  return months;
};

/* ═══════════════════════════════════════════════════
   1. FY PROFIT — MONTH-BY-MONTH TABLE
   GET /admin/finance/profit/fy?year=2026
   Sections: KPI cards, FY month-by-month revenue/expenses/profit table
   ═══════════════════════════════════════════════════ */
export const getFyProfit = async (req, res) => {
  try {
    const { year } = req.query;
    const now = new Date();
    const fyStartYear = year
      ? Number(year)
      : now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const { start: fyStart, end: fyEnd, fyLabel } = getFyRange(fyStartYear);

    /* ── Revenue per month (from user_subscriptions) ── */
    const [revenueRows] = await db.execute(
      `SELECT MONTH(created_at) AS m, YEAR(created_at) AS y,
              COALESCE(SUM(amount), 0) AS total_usd
       FROM user_subscriptions
       WHERE amount > 0 AND created_at >= ? AND created_at < ?
       GROUP BY YEAR(created_at), MONTH(created_at)`,
      [fyStart, fyEnd]
    );

    /* ── Expenses per month (from expense_entries) ── */
    const [expenseRows] = await db.execute(
      `SELECT month AS m, year AS y,
              COALESCE(SUM(amount_inr), 0) AS total_inr
       FROM expense_entries
       WHERE (year = ? AND month >= 4) OR (year = ? AND month <= 3)
       GROUP BY year, month`,
      [fyStartYear, fyStartYear + 1]
    );

    /* ── Build lookup maps ── */
    const revMap = {};
    for (const r of revenueRows) revMap[`${r.m}_${r.y}`] = Number(r.total_usd);

    const expMap = {};
    for (const e of expenseRows) expMap[`${e.m}_${e.y}`] = Number(e.total_inr);

    /* ── Assemble month-by-month table ── */
    let fyRevUsd  = 0;
    let fyExpInr  = 0;
    let fyExpUsd  = 0;
    let fyProfUsd = 0;

    const now2 = new Date();
    const currentM = now2.getMonth() + 1;
    const currentY = now2.getFullYear();

    const months = fyMonthOrder(fyStartYear).map(({ m, y }) => {
      const revUsd   = revMap[`${m}_${y}`] || 0;
      const expInr   = expMap[`${m}_${y}`] || 0;
      const expUsd   = expInr / usdToInr;
      const profUsd  = revUsd - expUsd;
      const margin   = revUsd > 0 ? Number(((profUsd / revUsd) * 100).toFixed(1)) : 0;
      const isCurrent = m === currentM && y === currentY;

      fyRevUsd  += revUsd;
      fyExpInr  += expInr;
      fyExpUsd  += expUsd;
      fyProfUsd += profUsd;

      return {
        month_label:  `${monthNames[m]}${isCurrent ? " · current" : ""}`,
        month:         m,
        year:          y,
        is_current:    isCurrent,
        revenue_usd:   revUsd.toFixed(2),
        revenue_inr:   (revUsd * usdToInr).toFixed(2),
        expenses_usd:  expUsd.toFixed(2),
        expenses_inr:  expInr.toFixed(2),
        profit_usd:    profUsd.toFixed(2),
        profit_inr:    (profUsd * usdToInr).toFixed(2),
        margin_pct:    margin,
        is_loss:       profUsd < 0,
      };
    });

    const fyMargin = fyRevUsd > 0
      ? Number(((fyProfUsd / fyRevUsd) * 100).toFixed(1))
      : 0;

    return res.status(200).json({
      success: true,

      kpis: {
        revenue_fy_usd:   fyRevUsd.toFixed(2),
        revenue_fy_inr:   (fyRevUsd * usdToInr).toFixed(2),
        expenses_fy_usd:  fyExpUsd.toFixed(2),
        expenses_fy_inr:  fyExpInr.toFixed(2),
        profit_fy_usd:    fyProfUsd.toFixed(2),
        profit_fy_inr:    (fyProfUsd * usdToInr).toFixed(2),
      },

      fy_label:   fyLabel,
      fy_start:   fyStart,
      fy_end:     fyEnd,

      months,

      totals: {
        revenue_usd:  fyRevUsd.toFixed(2),
        revenue_inr:  (fyRevUsd * usdToInr).toFixed(2),
        expenses_usd: fyExpUsd.toFixed(2),
        expenses_inr: fyExpInr.toFixed(2),
        profit_usd:   fyProfUsd.toFixed(2),
        profit_inr:   (fyProfUsd * usdToInr).toFixed(2),
        margin_pct:   fyMargin,
        is_loss:      fyProfUsd < 0,
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. PROFIT STATEMENT — SELECTED MONTH
   GET /admin/finance/profit/statement?month=7&year=2026
   Sections: Profit statement line items,
             "Where revenue goes" breakdown
   ═══════════════════════════════════════════════════ */
export const getProfitStatement = async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const targetMonth = month ? Number(month) : now.getMonth() + 1;
    const targetYear  = year  ? Number(year)  : now.getFullYear();

    const fyStartYear = targetMonth >= 4 ? targetYear : targetYear - 1;
    const { start: fyStart, end: fyEnd, fyLabel } = getFyRange(fyStartYear);

    /* ── Selected month revenue ── */
    const [[monthRev]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total_usd
       FROM user_subscriptions
       WHERE amount > 0 AND MONTH(created_at) = ? AND YEAR(created_at) = ?`,
      [targetMonth, targetYear]
    );

    /* ── Selected month expenses ── */
    const [[monthExp]] = await db.execute(
      `SELECT COALESCE(SUM(amount_inr), 0) AS total_inr
       FROM expense_entries
       WHERE month = ? AND year = ?`,
      [targetMonth, targetYear]
    );

    /* ── FY revenue ── */
    const [[fyRev]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total_usd
       FROM user_subscriptions
       WHERE amount > 0 AND created_at >= ? AND created_at < ?`,
      [fyStart, fyEnd]
    );

    /* ── FY expenses ── */
    const [[fyExp]] = await db.execute(
      `SELECT COALESCE(SUM(amount_inr), 0) AS total_inr
       FROM expense_entries
       WHERE (year = ? AND month >= 4) OR (year = ? AND month <= 3)`,
      [fyStartYear, fyStartYear + 1]
    );

    const mRevUsd  = Number(monthRev.total_usd);
    const mExpInr  = Number(monthExp.total_inr);
    const mExpUsd  = mExpInr / usdToInr;
    const mProfUsd = mRevUsd - mExpUsd;
    const mMargin  = mRevUsd > 0 ? Number(((mProfUsd / mRevUsd) * 100).toFixed(1)) : 0;

    const fyRevUsd  = Number(fyRev.total_usd);
    const fyExpInr  = Number(fyExp.total_inr);
    const fyExpUsd  = fyExpInr / usdToInr;
    const fyProfUsd = fyRevUsd - fyExpUsd;
    const fyMargin  = fyRevUsd > 0 ? Number(((fyProfUsd / fyRevUsd) * 100).toFixed(1)) : 0;

    const monthLabel = `${monthNames[targetMonth]} ${targetYear}`;

    return res.status(200).json({
      success: true,

      month:        targetMonth,
      year:          targetYear,
      month_label:   monthLabel,
      fy_label:       fyLabel,

      /* ── Profit statement line items ── */
      statement: {
        line_items: [
          {
            label:       "Coin revenue",
            month_usd:    mRevUsd.toFixed(2),
            month_inr:    (mRevUsd * usdToInr).toFixed(2),
            fy_usd:        fyRevUsd.toFixed(2),
            fy_inr:        (fyRevUsd * usdToInr).toFixed(2),
          },
          {
            label:       "Operating expenses",
            month_usd:    `-${mExpUsd.toFixed(2)}`,
            month_inr:    `-${mExpInr.toFixed(2)}`,
            fy_usd:        `-${fyExpUsd.toFixed(2)}`,
            fy_inr:        `-${fyExpInr.toFixed(2)}`,
          },
        ],
        profit_before_tax: {
          month_usd:  mProfUsd.toFixed(2),
          month_inr:  (mProfUsd * usdToInr).toFixed(2),
          fy_usd:      fyProfUsd.toFixed(2),
          fy_inr:      (fyProfUsd * usdToInr).toFixed(2),
        },
        margin: {
          month_pct: mMargin,
          fy_pct:    fyMargin,
        },
      },

      /* ── Where revenue goes (bar chart data) ── */
      where_revenue_goes: {
        total_revenue_usd: mRevUsd.toFixed(2),
        total_revenue_inr: (mRevUsd * usdToInr).toFixed(2),
        operating_expenses: {
          usd:     mExpUsd.toFixed(2),
          inr:     mExpInr.toFixed(2),
          pct:     mRevUsd > 0 ? Number(((mExpUsd / mRevUsd) * 100).toFixed(1)) : 0,
        },
        profit_before_tax: {
          usd:     mProfUsd.toFixed(2),
          inr:     (mProfUsd * usdToInr).toFixed(2),
          pct:     mMargin,
          is_loss: mProfUsd < 0,
        },
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};




/* ═══════════════════════════════════════════════════
   1. PAYMENTS SUMMARY
   GET /admin/finance/payments/summary?tab=today|by_month|fy_report
                                       &month=7&year=2026
   Sections: KPI cards, by-status breakdown table
   ═══════════════════════════════════════════════════ */
export const getPaymentsSummary = async (req, res) => {
  try {
    const { tab = "today", month, year } = req.query;

    const validTabs = ["today", "by_month", "fy_report"];
    if (!validTabs.includes(tab)) {
      return res.status(400).json({
        success: false,
        message: `Invalid tab. Allowed: ${validTabs.join(", ")}`,
      });
    }

    const now         = new Date();
    const targetMonth = month ? Number(month) : now.getMonth() + 1;
    const targetYear  = year  ? Number(year)  : now.getFullYear();

    const fyStartYear = targetMonth >= 4 ? targetYear : targetYear - 1;
    const { start: fyStart, end: fyEnd } = getFyRange(fyStartYear);
    const fyLabel = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;

    /* ── KPI cards (always computed) ── */
    const [[kpiToday]] = await db.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END), 0)  AS net_usd,
         COALESCE(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END), 0) * ? AS net_inr
       FROM user_subscriptions
       WHERE DATE(created_at) = CURDATE()`,
      [usdToInr]
    );

    const [[kpiMonth]] = await db.execute(
      `SELECT COALESCE(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END), 0) AS net_usd
       FROM user_subscriptions
       WHERE MONTH(created_at) = ? AND YEAR(created_at) = ?`,
      [targetMonth, targetYear]
    );

    const [[kpiFy]] = await db.execute(
      `SELECT COALESCE(SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END), 0) AS net_usd
       FROM user_subscriptions
       WHERE created_at >= ? AND created_at < ?`,
      [fyStart, fyEnd]
    );

    /* ── Needs refund: failed+charged ── */
    const [[needsRefund]] = await db.execute(
      `SELECT COUNT(*) AS cnt,
              COALESCE(SUM(amount), 0) AS total_usd
       FROM user_subscriptions
       WHERE status = 'failed' AND payment_reference IS NOT NULL
         AND payment_reference != ''`
    );

    /* ── Resolve date condition for selected tab ── */
    let dateCondition;
    const dateParams = [];
    let periodLabel;

    if (tab === "today") {
      dateCondition = `DATE(us.created_at) = CURDATE()`;
      periodLabel = `Today · ${now.toISOString().slice(0, 10)}`;
    } else if (tab === "by_month") {
      dateCondition = `MONTH(us.created_at) = ? AND YEAR(us.created_at) = ?`;
      dateParams.push(targetMonth, targetYear);
      periodLabel = `${monthNames[targetMonth]} ${targetYear}`;
    } else {
      dateCondition = `us.created_at >= ? AND us.created_at < ?`;
      dateParams.push(fyStart, fyEnd);
      periodLabel = fyLabel;
    }

    /* ── By-status breakdown ── */
    const [statusRows] = await db.execute(
      `SELECT
         us.status,
         COUNT(*)                                                                 AS count,
         COALESCE(SUM(CASE WHEN us.status = 'active'   THEN us.amount ELSE 0 END), 0) AS success_usd,
         COALESCE(SUM(CASE WHEN us.status = 'expired'  THEN us.amount ELSE 0 END), 0) AS refunded_usd
       FROM user_subscriptions us
       WHERE ${dateCondition}
       GROUP BY us.status`,
      dateParams
    );

    /* ── Compute net collected ── */
    let successCount    = 0;
    let successUsd      = 0;
    let failedDeclined  = 0;
    let failedCharged   = 0;
    let refundedCount   = 0;
    let pendingCount    = 0;

    for (const r of statusRows) {
      if (r.status === "active") {
        successCount = Number(r.count);
        successUsd   = Number(r.success_usd);
      } else if (r.status === "failed") {
        failedDeclined = Number(r.count);
      } else if (r.status === "expired") {
        refundedCount = Number(r.count);
      } else if (r.status === "pending") {
        pendingCount = Number(r.count);
      }
    }

    const netUsd = successUsd;

    return res.status(200).json({
      success: true,

      kpis: {
        net_today_usd:   Number(kpiToday.net_usd).toFixed(2),
        net_today_inr:   Number(kpiToday.net_inr).toFixed(2),
        net_month_usd:   Number(kpiMonth.net_usd).toFixed(2),
        net_month_inr:   (Number(kpiMonth.net_usd) * usdToInr).toFixed(2),
        net_fy_usd:       Number(kpiFy.net_usd).toFixed(2),
        net_fy_inr:       (Number(kpiFy.net_usd) * usdToInr).toFixed(2),
        needs_refund: {
          count:     Number(needsRefund.cnt),
          total_usd: Number(needsRefund.total_usd).toFixed(2),
        },
        month_label: `${monthNames[targetMonth]} ${targetYear}`,
        fy_label:     fyLabel,
      },

      tab,
      period_label: periodLabel,

      by_status: {
        period_net_usd:   netUsd.toFixed(2),
        period_net_inr:   (netUsd * usdToInr).toFixed(2),
        breakdown: [
          {
            status:      "Success",
            count:        successCount,
            value_usd:    successUsd.toFixed(2),
            value_inr:    (successUsd * usdToInr).toFixed(2),
            note:          null,
          },
          {
            status:      "Failed · declined",
            count:        failedDeclined,
            value_usd:    null,
            value_inr:    null,
            note:          "no charge",
          },
          {
            status:      "Failed · charged",
            count:        failedCharged,
            value_usd:    null,
            value_inr:    null,
            note:          "needs refund",
          },
          {
            status:      "Refunded",
            count:        refundedCount,
            value_usd:    null,
            value_inr:    null,
            note:          null,
          },
          {
            status:      "Pending",
            count:        pendingCount,
            value_usd:    null,
            value_inr:    null,
            note:          "in-flight",
          },
        ],
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. TRANSACTION LOG
   GET /admin/finance/payments/transactions
       ?tab=all|today|by_month|fy_report
       &month=7&year=2026
       &status=all|success|failed_declined|failed_charged|refunded|pending
       &page=1&limit=20
   Section: Transaction log table
   ═══════════════════════════════════════════════════ */
export const getTransactionLog = async (req, res) => {
  try {
    const {
      tab    = "all",
      month,
      year,
      status = "all",
      page   = 1,
      limit  = 20,
    } = req.query;

    const now         = new Date();
    const targetMonth = month ? Number(month) : now.getMonth() + 1;
    const targetYear  = year  ? Number(year)  : now.getFullYear();
    const limitNum    = Number(limit);
    const offsetNum   = (Number(page) - 1) * limitNum;

    const fyStartYear = targetMonth >= 4 ? targetYear : targetYear - 1;
    const { start: fyStart, end: fyEnd } = getFyRange(fyStartYear);

    /* ── Date condition ── */
    let dateCondition;
    const params = [];

    if (tab === "all") {
      dateCondition = `1 = 1`;
    } else if (tab === "today") {
      dateCondition = `DATE(ct.created_at) = CURDATE()`;
    } else if (tab === "by_month") {
      dateCondition = `MONTH(ct.created_at) = ? AND YEAR(ct.created_at) = ?`;
      params.push(targetMonth, targetYear);
    } else {
      dateCondition = `ct.created_at >= ? AND ct.created_at < ?`;
      params.push(fyStart, fyEnd);
    }

    /* ── Status filter ── */
    const statusMap = {
      success:         `ct.status = 'success'`,
      failed_declined: `ct.status = 'failed' AND (ct.reference_id IS NULL OR ct.reference_id = '')`,
      failed_charged:  `ct.status = 'failed' AND ct.reference_id IS NOT NULL AND ct.reference_id != ''`,
      refunded:        `ct.status = 'refunded'`,
      pending:          `ct.status = 'pending'`,
    };

    const statusCondition = status !== "all" && statusMap[status]
      ? `AND ${statusMap[status]}`
      : "";

    /* ── Status counts for tab badges ── */
    const [countRows] = await db.execute(
      `SELECT
         CASE
           WHEN ct.status = 'success' THEN 'success'
           WHEN ct.status = 'failed' AND (ct.reference_id IS NULL OR ct.reference_id = '') THEN 'failed_declined'
           WHEN ct.status = 'failed' AND ct.reference_id IS NOT NULL AND ct.reference_id != '' THEN 'failed_charged'
           WHEN ct.status = 'refunded' THEN 'refunded'
           WHEN ct.status = 'pending' THEN 'pending'
           ELSE ct.status
         END AS mapped_status,
         COUNT(*) AS cnt
       FROM coins_transactions ct
       WHERE ct.coins > 0 AND ${dateCondition}
       GROUP BY mapped_status`,
      params
    );

    const counts = { all: 0, success: 0, failed_declined: 0, failed_charged: 0, refunded: 0, pending: 0 };
    for (const r of countRows) {
      counts.all += Number(r.cnt);
      if (counts[r.mapped_status] !== undefined) counts[r.mapped_status] += Number(r.cnt);
    }

    /* ── Transaction list ── */
    const [rows] = await db.execute(
      `SELECT
         ct.id,
         ct.plan_id,
         ct.coins,
         ct.amount,
         ct.status,
         ct.reference_id,
         ct.created_at,
         COALESCE(ct.user_name, u.fullname) AS fullname,
         u.country,
         sp.name AS plan_name
       FROM coins_transactions ct
       LEFT JOIN users u ON u.id = ct.user_id
       LEFT JOIN subscription_plans sp ON sp.id = ct.plan_id
       WHERE ct.coins > 0 AND ${dateCondition} ${statusCondition}
       ORDER BY ct.created_at DESC
       LIMIT ${limitNum} OFFSET ${offsetNum}`,
      params
    );

    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM coins_transactions ct
       WHERE ct.coins > 0 AND ${dateCondition} ${statusCondition}`,
      params
    );

    const txStatusLabel = (us) => {
      if (us.status === "active")  return "Success";
      if (us.status === "expired") return "Refunded";
      if (us.status === "pending") return "Pending";
      if (us.status === "failed") {
        return us.payment_reference ? "Failed · charged" : "Failed · declined";
      }
      return us.status;
    };

    return res.status(200).json({
      success: true,

      tab,
      period_label: tab === "today"
        ? `Today`
        : tab === "all"
        ? `All transactions`
        : tab === "by_month"
        ? `${monthNames[targetMonth]} ${targetYear}`
        : `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`,

      status_counts: counts,

      pagination: {
        total:       Number(total),
        page:        Number(page),
        limit:       limitNum,
        total_pages: Math.ceil(Number(total) / limitNum),
      },

      transactions: rows.map((r) => ({
        tx_id:             `TX-${r.id}`,
        fullname:           r.fullname,
        country:            r.country,
        pack:               r.plan_name,
        coins:              Number(r.coins),
        amount_usd:         Number(r.amount).toFixed(2),
        amount_inr:         (Number(r.amount) * usdToInr).toFixed(2),
        status:             txStatusLabel(r),
        payment_reference:  r.payment_reference,
        date:               r.created_at,
        can_refund:         r.status === "failed" && r.payment_reference,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
