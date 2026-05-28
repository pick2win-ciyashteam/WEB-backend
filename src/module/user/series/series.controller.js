import db from  "../../../config/db.js";

export const getAllSeries = async (req, res) => {
  try { 
    const [seriesRows] = await db.execute(`
      SELECT 
        id, seriesid, name, season,
        start_date, end_date, created_at,
        status, is_selected
      FROM series
      ORDER BY created_at DESC
    `);

    const result = await Promise.all(
      seriesRows.map(async (series) => {

        const [matches] = await db.execute(
          `SELECT 
              m.id,
              m.provider_match_id,
              m.series_id,
              m.start_time,
              m.status,
              m.matchdate,
              m.lineupavailable,
              m.lineup_status,
              m.is_active,
              ht.short_name AS home_team_name,
              awt.short_name AS away_team_name,
              ht.logo AS home_team_logo,
              awt.logo AS away_team_logo,
              COUNT(c.id) AS total_contests
            FROM matches m
            JOIN teams ht ON m.home_team_id = ht.id
            JOIN teams awt ON m.away_team_id = awt.id
            LEFT JOIN contest c ON c.match_id = m.id
            WHERE m.series_id = ?
              AND m.is_active = 1
              AND m.status = 'UPCOMING'
            GROUP BY 
              m.id, m.provider_match_id, m.series_id,
              m.start_time, m.status, m.matchdate,
              m.lineupavailable, m.lineup_status, m.is_active,
              ht.short_name, awt.short_name,
              ht.logo, awt.logo
            ORDER BY m.start_time ASC`,
          [series.seriesid]
        );


        return {
          ...series,
          total_matches: matches.length,
          matches,
        };
      })
    );

    // UPCOMING matches leni series filter out cheyyi
    const filtered = result.filter((series) => series.total_matches > 0);

    // POLICY STATUS
    const [policyRows] = await db.query(
      `SELECT
        COUNT(*) AS total_mandatory,
        SUM(CASE WHEN upa.id IS NOT NULL THEN 1 ELSE 0 END) AS total_accepted
      FROM policy_categories pc
      INNER JOIN policy_versions pv
        ON pv.category_id = pc.id
        AND pv.is_active = 1
      LEFT JOIN user_policy_acceptances upa
        ON upa.policy_version_id = pv.id
        AND upa.user_id = ?
      WHERE pc.is_active = 1
        AND pc.is_mandatory = 1
        AND pc.screen = 'signup'`,
      [req.user.id]
    );

    const policiesAccepted =
      Number(policyRows[0]?.total_accepted) >= Number(policyRows[0]?.total_mandatory) &&
      Number(policyRows[0]?.total_mandatory) > 0;

    res.status(200).json({
      success: true,
       policiesAccepted, 
      count: filtered.length,
      data: filtered,
    });

  } catch (error) {
    
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getSeriesById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate id presence
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Series id is required"
      });
    }

    // Convert to number
    const seriesid = Number(id);

    // Validate numeric id
    if (Number.isNaN(seriesid)) {
      return res.status(400).json({
        success: false,
        message: "Series id must be a number"
      });
    }

    // Query DB
    const [rows] = await db.execute(
      "SELECT * FROM series WHERE seriesid = ? LIMIT 1",
      [seriesid]
    );

    // Not found
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Series not found"
      });
    }

    // Success
    return res.status(200).json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.error("GetSeriesById Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


export const getMatchesBySeriesId = async (req, res) => {
  try {
    const { seriesid } = req.params;

    if (!seriesid) {
      return res.status(400).json({
        success: false,
        message: "Series id is required"
      });
    }

    const [rows] = await db.execute(
      `SELECT * FROM matches WHERE series_id = ? ORDER BY start_time ASC`,
      [seriesid]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (error) {
    console.error("GetMatchesBySeriesId Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
       