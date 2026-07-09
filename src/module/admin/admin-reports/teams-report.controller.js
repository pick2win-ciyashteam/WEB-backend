import db from "../../../config/db.js";

/* ═══════════════════════════════════════════════════
   TEAMS GENERATION REPORT - Comprehensive Analytics
   GET /admin/reports/teams-analytics
═══════════════════════════════════════════════════ */
export const getTeamsGenerationReport = async (req, res) => {
  try {
    const { period = 7, match_id } = req.query;
    const days = parseInt(period) || 7;

    /* ════════════════════════════════
       1. OVERALL TEAMS STATS
    ════════════════════════════════ */
    const [[overallStats]] = await db.execute(
      `SELECT
         COUNT(DISTINCT id)      AS total_generations,
         COUNT(DISTINCT user_id) AS unique_users,
         COUNT(DISTINCT match_id) AS matches_used,
         COUNT(DISTINCT game)    AS game_types,
         AVG(coins_spent)        AS avg_coins_per_generation
       FROM match_generation_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    /* ════════════════════════════════
       2. TEAMS BY GAME TYPE
    ════════════════════════════════ */
    const [gameStats] = await db.execute(
      `SELECT
         game,
         COUNT(*)                AS generations,
         COUNT(DISTINCT user_id) AS users,
         COUNT(DISTINCT match_id) AS matches,
         AVG(coins_spent)        AS avg_coins
       FROM match_generation_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY game
       ORDER BY generations DESC`,
      [days]
    );

    /* ════════════════════════════════
       3. TOP MATCHES BY TEAMS USAGE
    ════════════════════════════════ */
    const [topMatches] = await db.execute(
      `SELECT
         mgl.match_id,
         m.hometeamname,
         m.awayteamname,
         m.start_time,
         COUNT(mgl.id)           AS total_teams_generated,
         COUNT(DISTINCT mgl.user_id) AS unique_users,
         COUNT(DISTINCT mgl.game) AS game_types,
         SUM(mgl.coins_spent)    AS total_coins_spent,
         AVG(mgl.coins_spent)    AS avg_coins_per_team
       FROM match_generation_log mgl
       JOIN matches m ON m.id = mgl.match_id
       WHERE mgl.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY mgl.match_id
       ORDER BY total_teams_generated DESC
       LIMIT 10`,
      [days]
    );

    /* ════════════════════════════════
       4. TOP USERS BY TEAM GENERATIONS
    ════════════════════════════════ */
    const [topUsers] = await db.execute(
      `SELECT
         mgl.user_id,
         u.fullname,
         u.country,
         COUNT(mgl.id)        AS teams_generated,
         COUNT(DISTINCT mgl.match_id) AS matches_played,
         COUNT(DISTINCT mgl.game) AS games_used,
         SUM(mgl.coins_spent) AS total_coins_spent,
         AVG(mgl.coins_spent) AS avg_coins_per_team,
         MAX(mgl.created_at)  AS last_generation
       FROM match_generation_log mgl
       JOIN users u ON u.id = mgl.user_id
       WHERE mgl.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY mgl.user_id
       ORDER BY teams_generated DESC
       LIMIT 10`,
      [days]
    );

    /* ════════════════════════════════
       5. GENERATION STATUS SUMMARY
    ════════════════════════════════ */
    const [[statusSummary]] = await db.execute(
      `SELECT
         COUNT(CASE WHEN status = 'success' THEN 1 END) AS successful,
         COUNT(CASE WHEN status = 'failed'  THEN 1 END) AS failed,
         COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending
       FROM match_generation_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    /* ════════════════════════════════
       6. DAILY TREND
    ════════════════════════════════ */
    const [dailyTrend] = await db.execute(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*)         AS generations,
         COUNT(DISTINCT user_id) AS users,
         SUM(coins_spent) AS coins_spent
       FROM match_generation_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [days]
    );

    /* ════════════════════════════════
       7. COINS DISTRIBUTION
    ════════════════════════════════ */
    const [[coinsStats]] = await db.execute(
      `SELECT
         MIN(coins_spent) AS min_coins,
         MAX(coins_spent) AS max_coins,
         AVG(coins_spent) AS avg_coins,
         STDDEV_POP(coins_spent) AS std_dev_coins
       FROM match_generation_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    /* ════════════════════════════════
       8. COUNTRY DISTRIBUTION
    ════════════════════════════════ */
    const [countryDistribution] = await db.execute(
      `SELECT
         u.country,
         COUNT(DISTINCT mgl.user_id) AS users,
         COUNT(mgl.id)               AS teams_generated,
         SUM(mgl.coins_spent)        AS total_coins
       FROM match_generation_log mgl
       JOIN users u ON u.id = mgl.user_id
       WHERE mgl.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY u.country
       ORDER BY teams_generated DESC`,
      [days]
    );

    /* ════════════════════════════════
       RESPONSE
    ════════════════════════════════ */
    res.status(200).json({
      success: true,
      period_days: days,
      period_from: new Date(new Date().setDate(new Date().getDate() - days)).toISOString().split('T')[0],
      period_to: new Date().toISOString().split('T')[0],

      overall_stats: {
        total_generations: Number(overallStats.total_generations) || 0,
        unique_users: Number(overallStats.unique_users) || 0,
        matches_used: Number(overallStats.matches_used) || 0,
        game_types: Number(overallStats.game_types) || 0,
        avg_coins_per_gen: Number(overallStats.avg_coins_per_generation) || 0,
      },

      status_summary: {
        successful: Number(statusSummary.successful) || 0,
        failed: Number(statusSummary.failed) || 0,
        cancelled: Number(statusSummary.cancelled) || 0,
        pending: Number(statusSummary.pending) || 0,
        success_rate: statusSummary.successful > 0 
          ? Number(((statusSummary.successful / (statusSummary.successful + statusSummary.failed)) * 100).toFixed(1))
          : 0,
      },

      by_game_type: gameStats.map(g => ({
        game: g.game,
        generations: Number(g.generations),
        users: Number(g.users),
        matches: Number(g.matches),
        avg_coins: Number(g.avg_coins) || 0,
      })),

      top_matches: topMatches.map(m => ({
        match_id: m.match_id,
        home_team: m.hometeamname,
        away_team: m.awayteamname,
        start_time: m.start_time,
        teams_generated: Number(m.total_teams_generated),
        unique_users: Number(m.unique_users),
        game_types: Number(m.game_types),
        total_coins_spent: Number(m.total_coins_spent),
        avg_coins_per_team: Number(m.avg_coins_per_team) || 0,
      })),

      top_users: topUsers.map(u => ({
        user_id: u.user_id,
        fullname: u.fullname,
        country: u.country,
        teams_generated: Number(u.teams_generated),
        matches_played: Number(u.matches_played),
        games_used: Number(u.games_used),
        total_coins_spent: Number(u.total_coins_spent),
        avg_coins_per_team: Number(u.avg_coins_per_team) || 0,
        last_generation: u.last_generation,
      })),

      coins_distribution: {
        min: Number(coinsStats.min_coins) || 0,
        max: Number(coinsStats.max_coins) || 0,
        avg: Number(coinsStats.avg_coins) || 0,
        std_dev: Number(coinsStats.std_dev_coins) || 0,
      },

      country_distribution: countryDistribution.map(c => ({
        country: c.country,
        users: Number(c.users),
        teams_generated: Number(c.teams_generated),
        total_coins: Number(c.total_coins),
      })),

      daily_trend: dailyTrend.map(d => ({
        date: d.date,
        generations: Number(d.generations),
        users: Number(d.users),
        coins_spent: Number(d.coins_spent) || 0,
      })),
    });

  } catch (err) {
    console.error("❌ getTeamsGenerationReport:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ═══════════════════════════════════════════════════
   MATCH-SPECIFIC TEAMS REPORT
   GET /admin/reports/match/:matchId/teams
═══════════════════════════════════════════════════ */
export const getMatchTeamsReport = async (req, res) => {
  try {
    const { matchId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    /* ── Match details ── */
    const [[match]] = await db.execute(
      `SELECT id, hometeamname, awayteamname, start_time, status FROM matches WHERE id = ?`,
      [matchId]
    );

    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    /* ── Teams generated for this match ── */
    const [teams] = await db.execute(
      `SELECT
         mgl.id,
         mgl.user_id,
         u.fullname,
         u.country,
         mgl.game,
         mgl.coins_spent,
         mgl.status,
         mgl.created_at
       FROM match_generation_log mgl
       JOIN users u ON u.id = mgl.user_id
       WHERE mgl.match_id = ?
       ORDER BY mgl.created_at DESC
       LIMIT ? OFFSET ?`,
      [matchId, parseInt(limit), parseInt(offset)]
    );

    /* ── Total stats ── */
    const [[stats]] = await db.execute(
      `SELECT
         COUNT(*) AS total_teams,
         COUNT(DISTINCT user_id) AS unique_users,
         COUNT(DISTINCT game) AS game_types,
         SUM(coins_spent) AS total_coins_spent
       FROM match_generation_log
       WHERE match_id = ?`,
      [matchId]
    );

    res.status(200).json({
      success: true,
      match: {
        id: match.id,
        home_team: match.hometeamname,
        away_team: match.awayteamname,
        start_time: match.start_time,
        status: match.status,
      },
      stats: {
        total_teams: Number(stats.total_teams),
        unique_users: Number(stats.unique_users),
        game_types: Number(stats.game_types),
        total_coins_spent: Number(stats.total_coins_spent),
      },
      teams: teams.map(t => ({
        id: t.id,
        user_id: t.user_id,
        fullname: t.fullname,
        country: t.country,
        game: t.game,
        coins_spent: Number(t.coins_spent),
        status: t.status,
        created_at: t.created_at,
      })),
      limit: parseInt(limit),
      offset: parseInt(offset),
      total: Number(stats.total_teams),
    });

  } catch (err) {
    console.error("❌ getMatchTeamsReport:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
