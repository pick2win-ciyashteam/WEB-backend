// teams controlelr 
import db from "../../../config/db.js";

import axios from "axios";
import { sendNoreplyMail,  uctTeamsGeneratedEmailHtml,} from "../../../utils/mailer.js";


 export const generateTeams = async (req, res) => {
  try {
    const userId = req.user.id;
    const { match_id, team_a, team_b } = req.body;

    /* ── 1. Validate input ── */
    if (!match_id || !team_a || !team_b) {
      return res.status(400).json({
        success: false,
        message: "match_id, team_a, team_b required",
      });
    }

    if (!Array.isArray(team_a) || !Array.isArray(team_b)) {
      return res.status(400).json({
        success: false,
        message: "team_a and team_b must be arrays",
      });
    }

    if (team_a.length < 1 || team_b.length < 1) {
      return res.status(400).json({
        success: false,
        message: "team_a and team_b must have at least 1 player each",
      });
    }

    /* ── 2. Remove duplicates by name ── */
    const uniqueTeamA = team_a.filter(
      (p, idx, arr) => arr.findIndex((x) => x.name === p.name) === idx
    );
    const uniqueTeamB = team_b.filter(
      (p, idx, arr) => arr.findIndex((x) => x.name === p.name) === idx
    );

    /* ── 3. Match exists + status check ── */
    const [[match]] = await db.execute(
      `SELECT id, status, lineupavailable, lineup_status, start_time
       FROM matches WHERE id = ?`,
      [match_id]
    );

    if (!match) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }

    if (match.status !== "UPCOMING") {
      return res.status(400).json({
        success: false,
        message:
          match.status === "LIVE"
            ? "Match is already in progress. Teams cannot be generated."
            : match.status === "RESULT"
              ? "Match has ended. Teams cannot be generated."
              : "Teams can only be generated for upcoming matches.",
      });
    }

    if (Number(match.lineupavailable) !== 1) {
      return res.status(400).json({
        success: false,
        message: "Playing XI not announced yet. Please wait for lineup confirmation.",
      });
    }

    /* ── 4. Check already generated ── */
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

    /* ── 5. Check coins ── */
    const [[wallet]] = await db.execute(
      `SELECT available_coins, used_coins, total_coins
       FROM user_coins WHERE user_id = ?`,
      [userId]
    );

    if (!wallet || Number(wallet.available_coins) < 1) {
      return res.status(400).json({
        success: false,
        message: "Insufficient coins. Please buy coins to generate teams.",
      });
    }

    /* ── 6. Check free trial ── */
    const [[userRow]] = await db.execute(
      `SELECT free_trial_used FROM users WHERE id = ?`,
      [userId]
    );
    const isFreeTrial = userRow && userRow.free_trial_used === 0;

    /* ── 7. Subscription check — skip if free trial ── */
    if (!isFreeTrial) {
      const [[subscription]] = await db.execute(
        `SELECT id, plan_name, expiry_date, matches_allowed, matches_used
         FROM user_subscriptions
         WHERE user_id = ?
           AND status = 'active'
           AND expiry_date > NOW()
         ORDER BY id DESC LIMIT 1`,
        [userId]
      );

      if (!subscription) {
        return res.status(400).json({
          success: false,
          message: "No active subscription found. Please purchase a plan.",
        });
      }

      if (Number(subscription.matches_used) >= Number(subscription.matches_allowed)) {
        return res.status(400).json({
          success: false,
          message: `Match limit reached. Your ${subscription.plan_name} allows ${subscription.matches_allowed} matches.`,
        });
      }
    }

    /* ── 8. Convert real names → coded names for UCT API ── */
    const toUCT = (players, side) => {
      const counters = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      return players.map((p) => {
        const role = p.role || "MID";
        counters[role] = (counters[role] || 0) + 1;

        const prefix =
          role === "GK" ? "GK" :
            role === "DEF" ? "D" :
              role === "MID" ? "M" : "F";

        const codedName = `${prefix}${counters[role]}_${side}`;

        return {
          name: codedName,
          role,
          captain: p.captain || null,
          mandate: p.mandate || null, // ✅ mandate కావాలి
          _original: p.name,
        };
      });
    };

    const uctTeamA = toUCT(uniqueTeamA, "A");
    const uctTeamB = toUCT(uniqueTeamB, "B");
    const allMapped = [...uctTeamA, ...uctTeamB];

    /* ── 9. Resolve C / VC from CVC ── */
    const resolveCapForUCT = (capValue) => {
      if (!capValue) return undefined;
      if (capValue === "C") return "C";
      if (capValue === "VC") return "VC";
      if (capValue === "CVC") return "CVC";
      return undefined;
    };

    /* ── 10. Validate at least 1 C candidate and 1 VC candidate ── */
    const cCandidates = allMapped.filter(
      (p) => p.captain === "C" || p.captain === "CVC"
    );
    const vcCandidates = allMapped.filter(
      (p) => p.captain === "VC" || p.captain === "CVC"
    );

    if (cCandidates.length < 1) {
      return res.status(400).json({
        success: false,
        message: "At least 1 Captain (C or CVC) required",
      });
    }

    if (vcCandidates.length < 1) {
      return res.status(400).json({
        success: false,
        message: "At least 1 Vice-Captain (VC or CVC) required",
      });
    }

    /* ── 11. Build UCT payload ── */
    const buildUCTPlayer = (p) => {
  const obj = {
    name: p.name,
    role: p.role,
  };

  const cap = resolveCapForUCT(p.captain);

  if (cap) {
    obj.captain = cap;
  }

  // ✅ UCT API expects YES / NO in uppercase
  if (p.mandate) {
    obj.mandate = String(p.mandate)
      .trim()
      .toUpperCase();
  }

  return obj;
};

    const uctPayload = {
      team_a: uctTeamA.map(buildUCTPlayer),
      team_b: uctTeamB.map(buildUCTPlayer),
    };

    console.log("Team A Count:", uctPayload.team_a.length);
    console.log("Team B Count:", uctPayload.team_b.length);
    console.log("Total Players:", uctPayload.team_a.length + uctPayload.team_b.length);
    console.log("🚀 UCT Payload:", JSON.stringify(uctPayload, null, 2));

    /* ── 12. Call UCT API ── */
    const startTime = Date.now();
    let uctTeams = [];

    try {
      console.log("========================================");
      console.log("🚀 UCT URL:", `${process.env.UCT_API}/football/teams`);
      console.log("🚀 UCT Payload:");
      console.log(JSON.stringify(uctPayload, null, 2));
      console.log("========================================");

      const response = await axios.post(
        `${process.env.UCT_API}/football/teams`,
        uctPayload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 60000,
        }
      );

      console.log("✅ UCT Response Status:", response.status);
      console.log("✅ UCT Response Data:", JSON.stringify(response.data, null, 2));

      uctTeams = response.data || [];

      console.log(
        `✅ UCT API Success — ${Array.isArray(uctTeams) ? uctTeams.length : 0} records received`
      );
    } catch (apiError) {
      console.error("========================================");
      console.error("❌ UCT API FAILED");
      console.error("URL:", `${process.env.UCT_API}/football/teams`);
      console.error("Status:", apiError.response?.status);
      console.error("Status Text:", apiError.response?.statusText);
      console.error("Response Data:", JSON.stringify(apiError.response?.data, null, 2));
      console.error("Request Payload:", JSON.stringify(uctPayload, null, 2));
      console.error("Message:", apiError.message);
      console.error("Stack:", apiError.stack);
      console.error("========================================");

      return res.status(500).json({
        success: false,
        message: "UCT API failed",
        error: apiError.message,
        status: apiError.response?.status || null,
        details: apiError.response?.data || null,
      });
    }

    const generationTimeMs = Date.now() - startTime;

    if (!uctTeams.length) {
      return res.status(400).json({
        success: false,
        message: "UCT API returned no teams",
      });
    }
 /* ── 13. Build name map + selected map + mandate map ── */
const nameMap = {};
const selectedMap = {};
const mandateMap = {};

allMapped.forEach((p) => {
  nameMap[p.name] = p._original || p.name;

  const mandate = p.mandate
    ? String(p.mandate).trim().toUpperCase()
    : null;

  // mandateMap[p.name] = mandate;
 mandateMap[p.name] = p.mandate
  ? String(p.mandate).trim().toUpperCase()
  : null;

  // YES players ki selected = 1
  selectedMap[p.name] =
    mandate === "YES" ? 1 : 0;
});

    /* ── 14. Transaction ── */
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      /* Re-check coins */
      const [[currentWallet]] = await conn.query(
        `SELECT available_coins, used_coins, total_coins
         FROM user_coins WHERE user_id = ? FOR UPDATE`,
        [userId]
      );

      if (!currentWallet || Number(currentWallet.available_coins) < 1) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ success: false, message: "Insufficient coins" });
      }

      /* Deduct 1 coin */
      await conn.query(
        `UPDATE user_coins
         SET available_coins = available_coins - 1,
             used_coins      = used_coins + 1
         WHERE user_id = ?`,
        [userId]
      );

      /* Free trial mark */
      if (isFreeTrial) {
        await conn.query(
          `UPDATE users SET free_trial_used = 1 WHERE id = ?`,
          [userId]
        );
      }

      /* Coin transaction log */
      await conn.query(
        `INSERT INTO coins_transactions
           (user_id, coins, amount, transaction_type,
            opening_points, closing_points, description, status)
         VALUES (?, -1, 0, 'spent', ?, ?, ?, 'success')`,
        [
          userId,
          Number(currentWallet.available_coins),
          Number(currentWallet.available_coins) - 1,
          `Team generation — match ${match_id}`,
        ]
      );

      /* Delete old teams */
      await conn.query(
        `DELETE FROM user_teams WHERE match_id = ? AND user_id = ?`,
        [match_id, userId]
      );

    /* Store teams */
for (const player of uctTeams) {
  const realName =
    nameMap[player.name] || player.name;

  const capValue =
    player.cap && player.cap !== ""
      ? player.cap
      : null;

  const selected =
    selectedMap[player.name] || 0;

  const mandate =
    mandateMap[player.name] || null;

  console.log(
    `Saving Team ${player.dt_no} | ${realName} | CAP:${capValue} | SELECTED:${selected} | MANDATE:${mandate}`
  );

  await conn.query(
    `INSERT INTO user_teams
     (
       match_id,
       user_id,
       dt_no,
       name,
       role,
       cap,
       original_name,
       selected,
       mandate
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      match_id,
      userId,
      player.dt_no,
      player.name,
      player.role,
      capValue,
      realName,  
      selected,
      mandate,
    ]
  );
}

      /* Generation log */
      const totalTeams = [...new Set(uctTeams.map((p) => p.dt_no))].length;

      await conn.query(
        `INSERT INTO match_generation_log
           (match_id, user_id, total_teams, generation_time_ms, status)
         VALUES (?, ?, ?, ?, 'success')
         ON DUPLICATE KEY UPDATE
           total_teams        = VALUES(total_teams),
           generation_time_ms = VALUES(generation_time_ms),
           created_at         = NOW()`,
        [match_id, userId, totalTeams, generationTimeMs]
      );

      await conn.commit();

      /* Email */
      let emailSent = false;
      let emailError = null;

      try {
        const [[user]] = await db.execute(
          `SELECT fullname, email FROM users WHERE id = ?`,
          [userId]
        );

        const [[matchInfo]] = await db.execute(
          `SELECT * FROM matches WHERE id = ?`,
          [match_id]
        );

        if (user?.email && matchInfo) {
          await sendNoreplyMail({
            to: user.email,
            subject: "UCT Teams Generated Successfully",
            html: uctTeamsGeneratedEmailHtml({
              fullname: user.fullname || "User",
              leagueName: matchInfo.seriesname || "-",
              homeTeam: "-",
              awayTeam: "-",
              matchDate: matchInfo.matchdate
                ? new Date(matchInfo.matchdate).toLocaleDateString("en-IN")
                : "-",
              kickoffTime: matchInfo.start_time
                ? new Date(matchInfo.start_time).toLocaleTimeString("en-IN")
                : "-",
              teamsGenerated: totalTeams,
              coinsConsumed: 1,
              generatedOn: new Date().toLocaleString("en-IN"),
              attachmentFileName: `PICK2WIN_UCT_${match_id}.txt`,
            }),
          });
          emailSent = true;
        } else {
          emailError = "User email or match data not found";
        }
      } catch (err) {
        emailError = err.message;
      }

      return res.status(200).json({
        success: true,
        message: emailSent
          ? `${totalTeams} teams generated successfully and email sent successfully`
          : `${totalTeams} teams generated successfully but email could not be sent`,
        total_teams: totalTeams,
        coins_used: 1,
        coins_remaining: Number(currentWallet.available_coins) - 1,
        free_trial_used: isFreeTrial,
        email_sent: emailSent,
        email_error: emailError,
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error("generateTeams error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}; 

 export const getMyTeams = async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user.id;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: "matchId is required",
      });
    }

    const [players] = await db.execute(
      `SELECT
         ut.id,
         ut.match_id,
         ut.dt_no,
         ut.name,
         ut.original_name,
         ut.role,
         ut.cap,
         ut.selected,
         ut.mandate,
         ut.team_side,
         ut.provider_player_id,
         mp.logo AS player_image,
         CASE
           WHEN mp.is_playing    = 1 THEN 'playing_xi'
           WHEN mp.is_substitute = 1 THEN 'substitute'
           ELSE 'unknown'
         END AS status
       FROM user_teams ut
       LEFT JOIN match_players mp
              ON mp.match_id    = ut.match_id
             AND mp.player_name = ut.original_name
       WHERE ut.match_id = ?
         AND ut.user_id  = ?
       ORDER BY ut.dt_no, ut.role`,
      [matchId, userId]
    );

    if (!players.length) {
      return res.status(404).json({
        success: false,
        message: "No teams found for this match",
      });
    }

    /* ── Build teams map ── */
    const teamsMap = {};

    for (const player of players) {
      if (!teamsMap[player.dt_no]) {
        teamsMap[player.dt_no] = [];
      }

      teamsMap[player.dt_no].push({
        id:                 player.id,
        match_id:           player.match_id,
        dt_no:              player.dt_no,
        name:               player.name,
        original_name:      player.original_name,
        role:               player.role,
        cap:                player.cap    || null,
        selected:           player.selected === 1,
        mandate:            player.mandate ? player.mandate.toLowerCase() : null,
        team_side:          player.team_side || null,
        provider_player_id: player.provider_player_id || null,
        player_image:       player.player_image || null,
        status:             player.status,
      });
    }

    const teams = Object.entries(teamsMap).map(([dt_no, teamPlayers]) => ({
      team_no:      Number(dt_no),
      captain:      teamPlayers.find((p) => p.cap === "C")?.original_name  || null,
      vice_captain: teamPlayers.find((p) => p.cap === "VC")?.original_name || null,
      players:      teamPlayers,
    }));

    /* ── Preview calculations ── */
    const allPlayers = teams.flatMap((t) => t.players);

    const uniqueByName = (arr) =>
      Object.values(
        arr.reduce((acc, p) => {
          acc[p.original_name] = p;
          return acc;
        }, {})
      );

    const substitutes        = uniqueByName(allPlayers.filter((p) => p.selected === true));
    const mandateYes         = uniqueByName(allPlayers.filter((p) => p.mandate === "yes"));
    const mandateNo          = uniqueByName(allPlayers.filter((p) => p.mandate === "no"));
    const captainPlayers     = uniqueByName(allPlayers.filter((p) => p.cap === "C"));
    const viceCaptainPlayers = uniqueByName(allPlayers.filter((p) => p.cap === "VC"));
    const cvcPlayers         = uniqueByName(allPlayers.filter((p) => p.cap === "CVC"));

    /* unique captaincy pool */
    const captaincyPool = uniqueByName(
      allPlayers.filter((p) => p.cap === "C" || p.cap === "VC" || p.cap === "CVC")
    );

    const preview = {
      substitutes_count: substitutes.length,
      mandate_yes_count: mandateYes.length,
      mandate_no_count:  mandateNo.length,
      captaincy_count:   captaincyPool.length,

      substitutes: substitutes.map((p) => ({
        name:  p.original_name,
        role:  p.role,
        image: p.player_image,
        side:  p.team_side,
      })),

      mandate_yes: mandateYes.map((p) => ({
        name:  p.original_name,
        role:  p.role,
        image: p.player_image,
        side:  p.team_side,
      })),

      mandate_no: mandateNo.map((p) => ({
        name:  p.original_name,
        role:  p.role,
        image: p.player_image,
        side:  p.team_side,
      })),

      captains: captainPlayers.map((p) => ({
        name:  p.original_name,
        role:  p.role,
        image: p.player_image,
        side:  p.team_side,
      })),

      vice_captains: viceCaptainPlayers.map((p) => ({
        name:  p.original_name,
        role:  p.role,
        image: p.player_image,
        side:  p.team_side,
      })),

      cvc_players: cvcPlayers.map((p) => ({
        name:  p.original_name,
        role:  p.role,
        image: p.player_image,
        side:  p.team_side,
      })),
    };

    return res.status(200).json({
      success:     true,
      match_id:    Number(matchId),
      total_teams: teams.length,
      preview,
      teams,
    });

  } catch (error) {
    console.error("getMyTeams Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// export const getMyTeams = async (req, res) => {
//   try {
//     const { matchId } = req.params;
//     const userId = req.user.id;

//     if (!matchId) {
//       return res.status(400).json({
//         success: false,
//         message: "matchId is required",
//       });
//     }

//     const [players] = await db.execute(
//       `SELECT
//          ut.id,
//          ut.match_id,
//          ut.dt_no,
//          ut.name,
//          ut.original_name,
//          ut.role,
//          ut.cap,
//          ut.selected,
//          mp.logo AS player_image
//        FROM user_teams ut
//        LEFT JOIN match_players mp
//               ON mp.match_id = ut.match_id
//              AND mp.player_name = ut.original_name
//        WHERE ut.match_id = ?
//          AND ut.user_id = ?
//        ORDER BY ut.dt_no, ut.role`,
//       [matchId, userId]
//     );

//     if (!players.length) {
//       return res.status(404).json({
//         success: false,
//         message: "No teams found for this match",
//       });
//     }

//     const teamsMap = {};

//     for (const player of players) {
//       if (!teamsMap[player.dt_no]) {
//         teamsMap[player.dt_no] = [];
//       }
//       teamsMap[player.dt_no].push(player);
//     }

//     const teams = Object.entries(teamsMap).map(([dt_no, players]) => ({
//       team_no: Number(dt_no),
//       captain:
//         players.find((p) => p.cap === "C")?.original_name || null,
//       vice_captain:
//         players.find((p) => p.cap === "VC")?.original_name || null,
//       players: players.map((p) => ({
//         id: p.id,
//         match_id: p.match_id,
//         dt_no: p.dt_no,
//         name: p.name,
//         original_name: p.original_name,
//         role: p.role,
//         cap: p.cap,
//         selected: p.selected === 1,
//         player_image: p.player_image || null,
//       })),
//     }));

//     return res.status(200).json({
//       success: true,
//       match_id: Number(matchId),
//       total_teams: teams.length,
//       teams,
//     });
//   } catch (error) {
//     console.error("getMyTeams Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };


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
      total: rows.length,
      data: rows.map((r) => ({
        match_id: r.match_id,
        series_name: r.series_name,
        home_team: r.home_team,
        away_team: r.away_team,
        home_logo: r.home_logo,
        away_logo: r.away_logo,
        start_time: r.start_time,
        status: r.status,
        teams_generated: r.total_teams,
        generated_at: r.generated_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET MY 20 TEAMS ================= */
export const getMyGeneratedTeams = async (req, res) => {
  try {
    const userId = req.user.id;
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
      total: teams.length,
      data: teams.map((t) => ({
        team_id: t.team_id,
        team_name: t.team_name,
        total_players: t.total_players,
        created_at: t.created_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


export const getTeamPlayers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { teamId } = req.params;

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
      success: true,
      team_id: team.id,
      team_name: team.team_name,
      match_id: team.match_id,
      team_side: team.team_side,
      total: players.length,
      captain: players.find((p) => p.captain === "C") || null,
      vc: players.find((p) => p.captain === "VC") || null,
      players,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
  
 