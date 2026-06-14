//  // reports.controller.js
import db from "../../../config/db.js";

/* ═══════════════════════════════════════════════════
   1. OVERVIEW
   GET /admin/dashboard/overview
   Sections: Users KPIs, Monetization KPIs,  
             Coin Revenue (12 months), Users by Region
   ═══════════════════════════════════════════════════ */
export const getDashboardOverview = async (req, res) => {
  try {

    /* ── Users & Engine — At a Glance ── */
    const [[users]] = await db.execute(
      `SELECT
         COUNT(*)                                                        AS total_users,
         SUM(CASE WHEN CAST(account_status AS CHAR) = 'deleted'
                  THEN 1 ELSE 0 END)                                    AS deleted_accounts,
         SUM(CASE WHEN EXISTS (
               SELECT 1 FROM user_subscriptions us
               WHERE us.user_id    = u.id
                 AND us.status     = 'active'
                 AND us.expiry_date > NOW()
             ) THEN 1 ELSE 0 END)                                       AS active_purchased,
         SUM(CASE WHEN NOT EXISTS (
               SELECT 1 FROM user_subscriptions us
               WHERE us.user_id = u.id
             ) THEN 1 ELSE 0 END)                                       AS idle_no_pack
       FROM users u`
    );

    /* last week total_users for growth % */
    const [[lastWeekUsers]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE created_at <= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    const [[lastWeekActive]] = await db.execute(
      `SELECT COUNT(DISTINCT us.user_id) AS total
       FROM user_subscriptions us
       WHERE us.status      = 'active'
         AND us.expiry_date  > NOW()
         AND us.created_at  <= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    /* UCTs used today */
    const [[uctToday]] = await db.execute(
      `SELECT
         COUNT(DISTINCT id)      AS total_ucts,
         COUNT(DISTINCT user_id) AS unique_users
       FROM match_generation_log
       WHERE DATE(created_at) = CURDATE()`
    );

    /* ── Monetization & Lifecycle ── */
    const [[revenueMonth]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM coins_transactions
       WHERE coins   > 0
         AND status  = 'success'
         AND MONTH(created_at) = MONTH(NOW())
         AND YEAR(created_at)  = YEAR(NOW())`
    );

    const [[revenueToday]] = await db.execute(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM coins_transactions
       WHERE coins  > 0
         AND status = 'success'
         AND DATE(created_at) = CURDATE()`
    );

    const totalUsers      = Number(users.total_users);
    const activePurchased = Number(users.active_purchased);
    const activeRate      = totalUsers > 0
      ? Number(((activePurchased / totalUsers) * 100).toFixed(1))
      : 0;

    const totalUsersLastWk  = Number(lastWeekUsers.total);
    const activeLastWk      = Number(lastWeekActive.total);
    const userGrowthPct     = totalUsersLastWk > 0
      ? Number((((totalUsers - totalUsersLastWk) / totalUsersLastWk) * 100).toFixed(1))
      : 0;
    const activeGrowthPct   = activeLastWk > 0
      ? Number((((activePurchased - activeLastWk) / activeLastWk) * 100).toFixed(1))
      : 0;

    /* ── Users by Region ── */
    const [byRegion] = await db.execute(
      `SELECT
         country,
         COUNT(*) AS users
       FROM users
       WHERE CAST(account_status AS CHAR) != 'deleted'
       GROUP BY country
       ORDER BY users DESC
       LIMIT 10`
    );

    const totalRegionUsers = byRegion.reduce((s, r) => s + Number(r.users), 0);

    return res.status(200).json({
      success: true,

      users_at_a_glance: {
        total_users:      totalUsers,
        user_growth_wk:   `+${userGrowthPct}%`,
        active_purchased: activePurchased,
        active_growth_wk: `+${activeGrowthPct}%`,
        idle_no_pack:     Number(users.idle_no_pack),
        ucts_used_today:  Number(uctToday.total_ucts),
        users_today:      Number(uctToday.unique_users),
      },

      monetization: {
        deleted_accounts:  Number(users.deleted_accounts),
        active_rate_pct:   activeRate,
        revenue_this_month_usd: Number(revenueMonth.total).toFixed(2),
        revenue_today_usd:      Number(revenueToday.total).toFixed(2),
      },

      users_by_region: byRegion.map((r) => ({
        country: r.country,
        users:   Number(r.users),
        pct:     totalRegionUsers > 0
          ? Number(((Number(r.users) / totalRegionUsers) * 100).toFixed(1))
          : 0,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   2. LIVE
   GET /admin/dashboard/live
   Sections: Recent Activity Feed, Today's Match UCTs
   Poll every 30s from frontend
   ═══════════════════════════════════════════════════ */
export const getDashboardLive = async (req, res) => {
  try {

    /* ── Recent Activity Feed ── */
    /* Coin purchases */
    const [purchases] = await db.execute(
      `SELECT
         'purchase'            AS type,
         ct.created_at,
         u.fullname,
         u.country,
         sp.name               AS plan_name,
         ct.coins,
         ct.amount,
         NULL                  AS match_label,
         NULL                  AS match_id
       FROM coins_transactions ct
       JOIN users u               ON u.id    = ct.user_id
       LEFT JOIN subscription_plans sp ON sp.coins = ct.coins
       WHERE ct.coins  > 0
         AND ct.status = 'success'
         AND ct.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY ct.created_at DESC
       LIMIT 10`
    );

    /* UCT generations */
    const [generations] = await db.execute(
      `SELECT
         'uct_generated'       AS type,
         mgl.created_at,
         u.fullname,
         u.country,
         NULL                  AS plan_name,
         NULL                  AS coins,
         NULL                  AS amount,
         CONCAT(m.hometeamname, ' vs ', m.awayteamname) AS match_label,
         mgl.match_id
       FROM match_generation_log mgl
       JOIN users   u ON u.id = mgl.user_id
       JOIN matches m ON m.id = mgl.match_id
       WHERE mgl.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY mgl.created_at DESC
       LIMIT 10`
    );

    /* New signups */
    const [signups] = await db.execute(
      `SELECT
         'signup'              AS type,
         created_at,
         fullname,
         country,
         NULL AS plan_name,
         NULL AS coins,
         NULL AS amount,
         NULL AS match_label,
         NULL AS match_id
       FROM users
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY created_at DESC
       LIMIT 10`
    );

    /* Deleted accounts */
    const [deletions] = await db.execute(
      `SELECT
         'deleted'             AS type,
         updated_at            AS created_at,
         id                    AS fullname,
         NULL                  AS country,
         NULL AS plan_name,
         NULL AS coins,
         NULL AS amount,
         NULL AS match_label,
         NULL AS match_id
       FROM users
       WHERE CAST(account_status AS CHAR) = 'deleted'
         AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY updated_at DESC
       LIMIT 5`
    );

    /* Banned accounts */
    const [bans] = await db.execute(
      `SELECT
         'banned'              AS type,
         updated_at            AS created_at,
         fullname,
         country,
         NULL AS plan_name,
         NULL AS coins,
         NULL AS amount,
         NULL AS match_label,
         NULL AS match_id
       FROM users
       WHERE CAST(account_status AS CHAR) = 'banned'
         AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       ORDER BY updated_at DESC
       LIMIT 5`
    );

    /* Merge + sort all activity by created_at DESC */
    const allActivity = [
      ...purchases,
      ...generations,
      ...signups,
      ...deletions,
      ...bans,
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20)
      .map((e) => ({
        type:        e.type,
        fullname:    e.fullname,
        country:     e.country,
        plan_name:   e.plan_name,
        coins:       e.coins ? Number(e.coins) : null,
        amount:      e.amount ? Number(e.amount).toFixed(2) : null,
        match_label: e.match_label,
        match_id:    e.match_id,
        time_ago_sec: Math.round((new Date() - new Date(e.created_at)) / 1000),
        created_at:  e.created_at,
      }));

    /* ── Today's Match · UCTs Used ── */
    const [todayMatches] = await db.execute(
      `SELECT
         m.id,
         m.hometeamname,
         m.awayteamname,
         m.start_time,
         m.status,
         s.name                               AS series_name,
         COUNT(DISTINCT mgl.id)               AS ucts_used,
         COUNT(DISTINCT mgl.id) * 20          AS teams_generated,
         COUNT(DISTINCT u.country)            AS regions_active
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

    /* Today totals */
    const totalUctsToday    = todayMatches.reduce((s, r) => s + Number(r.ucts_used), 0);
    const totalTeamsToday   = totalUctsToday * 20;

    return res.status(200).json({
      success: true,

      recent_activity: allActivity,

      today_matches: {
        total_ucts_today:  totalUctsToday,
        total_teams_today: totalTeamsToday,
        matches: todayMatches.map((m) => ({
          id:              m.id,
          home_team:       m.hometeamname,
          away_team:       m.awayteamname,
          series:          m.series_name,
          start_time:      m.start_time,
          status:          m.status,
          ucts_used:       Number(m.ucts_used),
          teams_generated: Number(m.teams_generated),
          regions_active:  Number(m.regions_active),
        })),
      },
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


//* ═══════════════════════════════════════════════════
// 3. USERS MANAGEMENT
// GET /admin/dashboard/users
// Query Params: page, limit, status (active/idle/deleted), country, search

export const getUsersManagement = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "all",
      country = "",
      search = ""
    } = req.query;

    const limitNum = Number(limit);
    const offset = (Number(page) - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (country) {
      conditions.push("u.country = ?");
      params.push(country);
    }

    if (search) {
      conditions.push(`
        (
          u.fullname LIKE ?
          OR u.email LIKE ?
          OR CAST(u.id AS CHAR) LIKE ?
        )
      `);

      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (status === "active") {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM user_subscriptions us
          WHERE us.user_id = u.id
            AND us.status='active'
            AND us.expiry_date > NOW()
        )
      `);
    }

    if (status === "idle") {
      conditions.push(`
        NOT EXISTS (
          SELECT 1
          FROM user_subscriptions us
          WHERE us.user_id = u.id
            AND us.status='active'
            AND us.expiry_date > NOW()
        )
      `);
    }

    if (status === "deleted") {
      conditions.push(`CAST(u.account_status AS CHAR)='deleted'`);
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const [users] = await db.execute(
      `
      SELECT
        u.id,
        u.fullname,
        u.email,
        u.country,
        u.created_at,

        COALESCE(uc.available_coins,0) AS coins,

        CASE
          WHEN CAST(u.account_status AS CHAR)='deleted'
            THEN 'deleted'

          WHEN EXISTS (
            SELECT 1
            FROM user_subscriptions us
            WHERE us.user_id=u.id
              AND us.status='active'
              AND us.expiry_date > NOW()
          )
            THEN 'active'

          ELSE 'idle'
        END AS user_status

      FROM users u
      LEFT JOIN user_coins uc
        ON uc.user_id=u.id

      ${whereClause}

      ORDER BY u.id DESC
      LIMIT ${limitNum}
      OFFSET ${offset}
      `,
      params
    );

    const [[cards]] = await db.execute(`
      SELECT
        COUNT(*) total_users,

        SUM(
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM user_subscriptions us
              WHERE us.user_id=u.id
                AND us.status='active'
                AND us.expiry_date > NOW()
            )
            THEN 1 ELSE 0
          END
        ) active_accounts,

        SUM(
          CASE
            WHEN NOT EXISTS (
              SELECT 1
              FROM user_subscriptions us
              WHERE us.user_id=u.id
                AND us.status='active'
                AND us.expiry_date > NOW()
            )
            THEN 1 ELSE 0
          END
        ) idle_users,

        SUM(
          CASE
            WHEN CAST(account_status AS CHAR)='deleted'
            THEN 1 ELSE 0
          END
        ) deleted_accounts

      FROM users u
    `);

    res.status(200).json({
      success: true,

      cards,

      users
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

export const getCoinExpiryReminders = async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const [users] = await db.execute(
      `
      SELECT
        u.id,
        u.fullname,
        u.country,
        uc.available_coins AS coins_left,

        MAX(ct.created_at) AS last_purchase,

        DATE_ADD(
          MAX(ct.created_at),
          INTERVAL 365 DAY
        ) AS expiry_date,

        DATEDIFF(
          DATE_ADD(MAX(ct.created_at), INTERVAL 365 DAY),
          CURDATE()
        ) AS days_left

      FROM users u

      JOIN user_coins uc
        ON uc.user_id=u.id

      JOIN coins_transactions ct
        ON ct.user_id=u.id
       AND ct.coins > 0
       AND ct.status='success'

      WHERE uc.available_coins > 0

      GROUP BY
        u.id,
        u.fullname,
        u.country,
        uc.available_coins

      HAVING days_left <= ?
         AND days_left >= 0

      ORDER BY days_left ASC
      `,
      [days]
    );

    const coinsAtRisk = users.reduce(
      (sum, u) => sum + Number(u.coins_left),
      0
    );

    res.status(200).json({
      success: true,

      summary: {
        expiring_users: users.length,
        coins_at_risk: coinsAtRisk,
        urgent_users: users.filter(
          x => Number(x.days_left) <= 7
        ).length
      },

      users
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};