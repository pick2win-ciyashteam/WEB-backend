import db from "../../../config/db.js";

import axios from "axios";

// export const generateTeams = async (req, res) => {
//   try {
//     const userId = req.user.id; 
//     const { match_id, team_a, team_b } = req.body;

//     if (!match_id || !team_a || !team_b) {
//       return res.status(400).json({
//         success: false,
//         message: "match_id, team_a, team_b required",
//       });
//     }

//     if (!Array.isArray(team_a) || !Array.isArray(team_b)) {
//       return res.status(400).json({
//         success: false,
//         message: "team_a and team_b must be arrays",
//       });
//     }

//     const rows = [];

//     for (const player of team_a) {
//       rows.push([
//         match_id,
//         "team_a",
//         player.name,
//         player.role,
//         player.mandate || null,
//         player.captain || null,
//       ]);
//     }

//     for (const player of team_b) {
//       rows.push([
//         match_id,
//         "team_b",
//         player.name,
//         player.role,
//         player.mandate || null,
//         player.captain || null,
//       ]);
//     }  

//     await db.query(
//       `INSERT INTO user_teams
//        (match_id, team_side, name, role, mandate, captain)
//        VALUES ?`,
//       [rows]
//     );

//      // ── match_generation_log insert ──
//     await db.execute(
//       `INSERT INTO match_generation_log (match_id, user_id, total_teams)
//        VALUES (?, ?, ?)
//        ON DUPLICATE KEY UPDATE
//          total_teams = VALUES(total_teams),
//          created_at  = NOW()`,
//       [match_id, userId, 1]
//     );

//     // Send to UCT API
//     try {
//       const response = await axios.post(
//         `${process.env.UCT_API}/football/teams`,
//         {
//           match_id,
//           team_a,
//           team_b,
//         }
//       );

//       console.log("UCT API Response:", response.data);
//     } catch (apiError) {
//       console.error(
//         "UCT API Error:",
//         apiError.response?.data || apiError.message
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       message: "Teams created successfully",
//       total_players: rows.length,
//     });
//   } catch (err) {
//     return res.status(500).json({
//       success: false,
//       message: err.message,
//     });
//   }
// };


 
export const generateTeams = async (req, res) => {
  try {
    const userId = req.user.id;
    const { match_id, home_players, away_players } = req.body;

    if (!match_id || !home_players || !away_players) {
      return res.status(400).json({
        success: false,
        message: "match_id, home_players, away_players required",
      });
    }

    /* ── Check already generated ── */
    const [[existing]] = await db.execute(
      `SELECT id FROM match_generation_log WHERE match_id = ? AND user_id = ?`,
      [match_id, userId]
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Teams already generated for this match",
      });
    }

    /* ── Convert real players → UCT format ── */
    const convertToUCT = (players, side) => {
      const counters = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      return players.map((p) => {
        counters[p.role]++;
        const codedName = `${p.role[0]}${counters[p.role]}_${side}`;
        // GK_A, D1_A, M1_A etc.
        return {
          name:     codedName,
          role:     p.role,
          captain:  p.captain  || undefined,
          mandate:  p.mandate  || undefined,
          // keep original name for DB storage
          original_name:        p.name,
          provider_player_id:   p.provider_player_id,
        };
      });
    };

    const team_a_uct = convertToUCT(home_players, "A");
    const team_b_uct = convertToUCT(away_players, "B");

    /* ── UCT API call ── */
    let uctTeams = [];
    try {
      const response = await axios.post(
        `${process.env.UCT_API}/football/teams`,
        {
          team_a: team_a_uct.map(p => ({
            name:    p.name,
            role:    p.role,
            ...(p.captain && { captain: p.captain }),
            ...(p.mandate && { mandate: p.mandate }),
          })),
          team_b: team_b_uct.map(p => ({
            name:    p.name,
            role:    p.role,
            ...(p.captain && { captain: p.captain }),
            ...(p.mandate && { mandate: p.mandate }),
          })),
        },
        { timeout: 30000 }
      );

      uctTeams = response.data || [];
      console.log(`✅ UCT teams: ${uctTeams.length} players across 20 teams`);

    } catch (apiError) {
      console.error("❌ UCT API Error:", apiError.response?.data || apiError.message);
      return res.status(500).json({
        success: false,
        message: "UCT API failed: " + (apiError.response?.data?.message || apiError.message),
      });
    }

    if (!uctTeams.length) {
      return res.status(400).json({ success: false, message: "UCT API returned no teams" });
    }

    /* ── Build name mapping — coded → real ── */
    const nameMap = {};
    [...team_a_uct, ...team_b_uct].forEach(p => {
      nameMap[p.name] = {
        original_name:       p.original_name,
        provider_player_id:  p.provider_player_id,
      };
    });

    /* ── Delete old teams ── */
    await db.execute(
      `DELETE FROM user_teams WHERE match_id = ? AND user_id = ?`,
      [match_id, userId]
    );

    /* ── Store 20 teams ── */
    for (const player of uctTeams) {
      const mapped = nameMap[player.name] || {};
      await db.execute(
        `INSERT INTO user_teams
           (match_id, user_id, dt_no, name, role, cap,
            original_name, provider_player_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          match_id,
          userId,
          player.dt_no,
          player.name,
          player.role,
          player.cap || null,
          mapped.original_name       || player.name,
          mapped.provider_player_id  || null,
        ]
      );
    }

    /* ── Log ── */
    const totalTeams = [...new Set(uctTeams.map(p => p.dt_no))].length;
    await db.execute(
      `INSERT INTO match_generation_log (match_id, user_id, total_teams)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE total_teams = VALUES(total_teams), created_at = NOW()`,
      [match_id, userId, totalTeams]
    );

    return res.status(200).json({
      success:      true,
      message:      `${totalTeams} teams generated successfully`,
      total_teams:  totalTeams,
      total_players: uctTeams.length,
    });

  } catch (err) {
    console.error("generateTeams error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getMyTeams = async (req, res) => {
  try {
    const { matchId } = req.params;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: "matchId is required",
      });
    }

    const [teams] = await db.execute(
      `
      SELECT
        id,
        match_id,
        team_side,
        name,
        role,
        mandate,
        captain,
        created_at
      FROM user_teams
      WHERE match_id = ?
      ORDER BY team_side, role, name
      `,
      [matchId]
    );

    const teamA = teams.filter(
      (player) => player.team_side === "team_a"
    );

    const teamB = teams.filter(
      (player) => player.team_side === "team_b"
    );

    return res.status(200).json({
      success: true,
      match_id: Number(matchId),

      team_a_count: teamA.length,
      team_b_count: teamB.length,
      total_players: teams.length,

      captain_count:
        teams.filter((p) => p.captain === "C").length,

      vice_captain_count:
        teams.filter((p) => p.captain === "VC").length,

      team_a: teamA,
      team_b: teamB,
    });
  } catch (error) {
    console.error("getMyTeams Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};




/* ================= GET MY GENERATED MATCHES ================= */
 
export const getMyGeneratedMatches = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const [rows] = await db.execute(
      `SELECT
         mgl.match_id,
         mgl.total_teams,
         mgl.created_at  AS generated_at,
         m.start_time,
         m.status,
         s.name          AS series_name,
         COALESCE(ht.short_name,  ht.name,  'TBA') AS home_team,
         COALESCE(awt.short_name, awt.name, 'TBA') AS away_team,
         ht.logo   AS home_logo,
         awt.logo  AS away_logo
       FROM match_generation_log mgl
       JOIN matches m   ON m.id   = mgl.match_id
       LEFT JOIN series s   ON CAST(s.seriesid AS UNSIGNED) = m.series_id
       LEFT JOIN teams ht   ON ht.id  = m.home_team_id
       LEFT JOIN teams awt  ON awt.id = m.away_team_id
       WHERE mgl.user_id = ?
       ORDER BY mgl.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      total:   rows.length,
      data:    rows.map((r) => ({
        match_id:        r.match_id,
        series_name:     r.series_name,
        home_team:       r.home_team,
        away_team:       r.away_team,
        home_logo:       r.home_logo,
        away_logo:       r.away_logo,
        start_time:      r.start_time,
        status:          r.status,
        teams_generated: r.total_teams,
        generated_at:    r.generated_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET MY 20 TEAMS ================= */
export const getMyGeneratedTeams = async (req, res) => {
  try {
    const userId      = req.user.id;
    const { matchId } = req.params;

    const [teams] = await db.execute(
      `SELECT
         ut.id          AS team_id,
         ut.team_name,
         ut.created_at,
         COUNT(utp.id)  AS total_players,
         SUM(utp.is_captain)      AS has_captain,
         SUM(utp.is_vice_captain) AS has_vc
       FROM user_teams ut
       LEFT JOIN user_team_players utp ON utp.user_team_id = ut.id
       WHERE ut.user_id  = ?
         AND ut.match_id = ?
       GROUP BY ut.id
       ORDER BY ut.id ASC`,
      [userId, matchId]
    );

    if (!teams.length)
      return res.json({ success: true, total: 0, data: [] });

    res.json({
      success: true,
      total:   teams.length,
      data:    teams.map((t) => ({
        team_id:       t.team_id,
        team_name:     t.team_name,
        total_players: t.total_players,
        created_at:    t.created_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET TEAM PLAYERS BY TEAM ID ================= */
//  export const getTeamPlayers = async (req, res) => {
//   try {
//     const { matchId, teamSide } = req.params; // team_a or team_b

//     // Latest generation only — MAX created_at
//     const [[latest]] = await db.execute(
//       `SELECT MAX(created_at) AS latest_at
//        FROM user_teams
//        WHERE match_id = ?`,
//       [matchId]
//     );

//     const [players] = await db.execute(
//       `SELECT id, name, role, mandate, captain, team_side
//        FROM user_teams
//        WHERE match_id   = ?
//          AND team_side  = ?
//          AND created_at = ?
//        ORDER BY FIELD(role, 'GK', 'DEF', 'MID', 'FWD')`,
//       [matchId, teamSide, latest.latest_at]
//     );

//     res.json({
//       success:    true,
//       match_id:   Number(matchId),
//       team_side:  teamSide,
//       total:      players.length,
//       captain:    players.find((p) => p.captain === "C")  || null,
//       vc:         players.find((p) => p.captain === "VC") || null,
//       players,
//     });

//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };


export const getTeamPlayers = async (req, res) => {
  try {
    const userId          = req.user.id;
    const { teamId }      = req.params;

    const [[team]] = await db.execute(
  `SELECT id, name AS team_name, match_id, team_side, created_at
   FROM user_teams
   WHERE id = ?
   LIMIT 1`,
  [teamId]
);

    if (!team)
      return res.status(404).json({ success: false, message: "Team not found" });

    const latestAt = team.created_at;

    const [players] = await db.execute(
      `SELECT id, name, role, mandate, captain, team_side
       FROM user_teams
       WHERE match_id  = ?
         AND team_side = ?
         AND created_at = (
           SELECT MAX(created_at) FROM user_teams
           WHERE match_id = ? AND team_side = ?
         )
       ORDER BY FIELD(role, 'GK', 'DEF', 'MID', 'FWD')`,
      [team.match_id, team.team_side, team.match_id, team.team_side]
    );

    res.json({
      success:   true,
      team_id:   team.id,
      team_name: team.team_name,
      match_id:  team.match_id,
      team_side: team.team_side,
      total:     players.length,
      captain:   players.find((p) => p.captain === "C")  || null,
      vc:        players.find((p) => p.captain === "VC") || null,
      players,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};    