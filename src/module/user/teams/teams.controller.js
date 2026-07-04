// teams.controller.js
import db from "../../../config/db.js";
import axios from "axios";
import { sendNoreplyMail, uctTeamsGeneratedEmailHtml } from "../../../utils/mailer.js";

/* ================= GENERATE TEAMS ================= */

export const generateTeams = async (req, res) => {
  try {
    const userId = req.user.id;
    const { match_id, team_a, team_b } = req.body;

    /* ── 1. Validate input ── */
    if (!match_id || !team_a || !team_b) {
      return res.status(400).json({ success: false, message: "match_id, team_a, team_b required" });
    }

    if (!Array.isArray(team_a) || !Array.isArray(team_b)) {
      return res.status(400).json({ success: false, message: "team_a and team_b must be arrays" });
    }

    /* ── 2. Remove duplicates ── */
    const uniqueTeamA = team_a.filter((p, idx, arr) => arr.findIndex((x) => x.name === p.name) === idx);
    const uniqueTeamB = team_b.filter((p, idx, arr) => arr.findIndex((x) => x.name === p.name) === idx);

    const totalSquad = uniqueTeamA.length + uniqueTeamB.length;

    /* ── 3. Match check ── */
    const [[match]] = await db.execute(
      `SELECT id, status, lineupavailable, lineup_status, start_time FROM matches WHERE id = ?`,
      [match_id]
    );

    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    if (match.status !== "UPCOMING") {
      return res.status(400).json({
        success: false,
        message:
          match.status === "LIVE"   ? "Match is already in progress. Teams cannot be generated." :
          match.status === "RESULT" ? "Match has ended. Teams cannot be generated." :
                                      "Teams can only be generated for upcoming matches.",
      });
    }

    if (Number(match.lineupavailable) !== 1) {
      return res.status(400).json({ success: false, message: "Playing XI not announced yet. Please wait for lineup confirmation." });
    }

    /* ── 4. Already generated ── */
    const [[existing]] = await db.execute(
      `SELECT id FROM match_generation_log WHERE match_id = ? AND user_id = ?`,
      [match_id, userId]
    );
    if (existing) return res.status(400).json({ success: false, message: "Teams already generated for this match" });

    /* ── 5. Coins check ── */
    const [[wallet]] = await db.execute(
      `SELECT available_coins, used_coins, total_coins FROM user_coins WHERE user_id = ?`,
      [userId]
    );
    if (!wallet || Number(wallet.available_coins) < 1) {
      return res.status(400).json({ success: false, message: "Insufficient coins. Please buy coins to generate teams." });
    }

    /* ── 6. Free trial check ── */
    const [[userRow]] = await db.execute(`SELECT free_trial_used FROM users WHERE id = ?`, [userId]);
    const isFreeTrial = userRow && userRow.free_trial_used === 0;

    /* ── 7. Subscription check ── */
    if (!isFreeTrial) {
      const [[subscription]] = await db.execute(
        `SELECT id, plan_name, expiry_date, matches_allowed, matches_used
         FROM user_subscriptions
         WHERE user_id = ? AND status = 'active' AND expiry_date > NOW()
         ORDER BY id DESC LIMIT 1`,
        [userId]
      );
      if (!subscription) return res.status(400).json({ success: false, message: "No active subscription found. Please purchase a plan." });
      if (Number(subscription.matches_used) >= Number(subscription.matches_allowed)) {
        return res.status(400).json({ success: false, message: `Match limit reached. Your ${subscription.plan_name} allows ${subscription.matches_allowed} matches.` });
      }
    }

    /* ── 8. Convert real names → coded names ── */
    const toUCT = (players, side) => {
      const counters = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      return players.map((p) => {
        const role     = p.role || "MID";
        counters[role] = (counters[role] || 0) + 1;

        let codedName;
        if (role === "GK") {
          codedName = `GK_${side}`;
        } else {
          const prefix = role === "DEF" ? "D" : role === "MID" ? "M" : "F";
          codedName = `${prefix}${counters[role]}_${side}`;
        }

        console.log(`Mapping: ${codedName} → ${p.name}`);
        return {
          name:      codedName,
          role,
          captain:   p.captain || null,
          mandate:   p.mandate ? String(p.mandate).trim().toUpperCase() : null,
          _original: p.name,
          _side:     side === "A" ? "team_a" : "team_b",
        };
      });
    };

    const uctTeamA  = toUCT(uniqueTeamA, "A");
    const uctTeamB  = toUCT(uniqueTeamB, "B");
    const allMapped = [...uctTeamA, ...uctTeamB];

    /* ── 9. Build maps ── */
    const nameMap    = {};
    const capMap     = {};
    const mandateMap = {};
    const sideMap    = {};

    allMapped.forEach((p) => {
      nameMap[p.name]    = p._original || p.name;
      capMap[p.name]     = p.captain   || null;
      mandateMap[p.name] = p.mandate   || null;
      sideMap[p.name]    = p._side;
    });

    /* ── 10. Fetch substitutes ── */
    const [substituteRows] = await db.execute(
      `SELECT player_name FROM match_players WHERE match_id = ? AND is_substitute = 1`,
      [match_id]
    );
    const substituteNames = new Set(substituteRows.map((r) => r.player_name));

    const selectedMap = {};
    allMapped.forEach((p) => {
      selectedMap[p.name] = substituteNames.has(p._original) ? 1 : 0;
    });

    /* ── 11. Build UCT payload ── */
    const buildUCTPlayer = (p) => {
      const obj = { name: p.name, role: p.role };
      if (p.captain === "C")   obj.captain = "C";
      if (p.mandate === "YES") obj.mandate  = "YES";
      return obj;
    };

    const uctPayload = {
      team_a: uctTeamA.map(buildUCTPlayer),
      team_b: uctTeamB.map(buildUCTPlayer),
    };

    console.log("🚀 UCT Payload:", JSON.stringify(uctPayload, null, 2));

    /* ── 12. Call UCT API ── */
    const startTime = Date.now();
    let uctTeams    = [];

    try {
      const response = await axios.post(
        `${process.env.UCT_API}`,
        uctPayload,
        {
          headers: { "Content-Type": "application/json", "x-api-key": process.env.UCT_API_KEY },
          timeout: 60000,
        }
      );

      const raw = response.data;
      if (Array.isArray(raw?.teams)) {
        uctTeams = raw.teams;
      } else if (Array.isArray(raw)) {
        uctTeams = raw;
      } else {
        uctTeams = [];
      }

      console.log(`✅ UCT parsed: ${uctTeams.length} records`);

    } catch (apiError) {
      console.error("❌ UCT API FAILED:", apiError.message, apiError.response?.data);

      const uctDetail = apiError.response?.data?.detail || "";

      let userMessage = "Team generation failed. Please check your squad and try again.";

      if (uctDetail.toLowerCase().includes("sorare team generation failed")) {
        userMessage =
          "Invalid squad configuration. Please ensure:" +
          " each team has exactly 1 GK, max 4 DEF, max 4 MID, max 4 FWD," +
          " captain pool has 2–6 players, and squad total is between 10–22 players.";
      } else if (uctDetail.toLowerCase().includes("captain")) {
        userMessage = "Captain pool is invalid. Please select 2–6 captain candidates and try again.";
      } else if (uctDetail.toLowerCase().includes("mandate")) {
        userMessage = "Mandatory player (M-YES) selection is invalid. Maximum 2 allowed (max 1 GK).";
      } else if (uctDetail.toLowerCase().includes("goalkeeper") || uctDetail.toLowerCase().includes("gk")) {
        userMessage = "Each team must have exactly 1 Goalkeeper. Please check your squad.";
      } else if (uctDetail) {
        userMessage = `Team generation failed: ${uctDetail}`;
      }

      return res.status(400).json({
        success: false,
        message: userMessage,
      });
    }

    const generationTimeMs = Date.now() - startTime;

    if (!uctTeams.length) {
      return res.status(400).json({ success: false, message: "UCT API returned no teams" });
    }

    /* ── 13. TXT helpers ── */
    const formatDateINDIA = (date = new Date()) =>
      new Date(date).toLocaleString("en-IN", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: true, timeZone: "Asia/Kolkata",
      });

    /* ── 14. Build TXT content ── */
    const buildUctTxtContent = () => {
      const totalTeamsCount = [...new Set(uctTeams.map((p) => p.dt_no))].length;
      const lines = [];

      lines.push("PICK2WIN UCT EXPORT");
      lines.push(`Match ID      : ${match_id}`);
      lines.push(`Generated on  : ${formatDateINDIA(new Date())}`);
      lines.push(`Total teams   : ${totalTeamsCount}`);
      lines.push(`Squad size    : ${totalSquad} players`);
      lines.push("");

      const cPoolMapped = allMapped.filter(p => p.captain === "C");
      if (cPoolMapped.length) {
        lines.push("********************");
        lines.push(`CAPTAIN POOL (${cPoolMapped.length} players)`);
        cPoolMapped.forEach((p, i) => {
          lines.push(`${i + 1}. ${nameMap[p.name] || p.name} (${sideMap[p.name] === "team_a" ? "HOME" : "AWAY"} - ${p.role})`);
        });
        lines.push("********************");
        lines.push("");
      }

      const mYesMapped = allMapped.filter(p => p.mandate === "YES");
      if (mYesMapped.length) {
        lines.push("MANDATORY PLAYERS (M-YES)");
        mYesMapped.forEach((p, i) => {
          lines.push(`${i + 1}. ${nameMap[p.name] || p.name} (${sideMap[p.name] === "team_a" ? "HOME" : "AWAY"} - ${p.role})`);
        });
        lines.push("");
      }

      const subPlayers = allMapped.filter(p => substituteNames.has(p._original));
      if (subPlayers.length) {
        lines.push("SUBSTITUTE PLAYERS");
        subPlayers.forEach((p, i) => {
          lines.push(`${i + 1}. ${nameMap[p.name] || p.name} (${sideMap[p.name] === "team_a" ? "HOME" : "AWAY"} - ${p.role})`);
        });
        lines.push("");
      }

      lines.push("TEAM\tDT_NO\tCODE\tNAME\tROLE\tCAP\tSELECTED\tSIDE");

      const teamsByDtNo = {};
      uctTeams.forEach((player) => {
        const dtNo = Number(player.dt_no) || 0;
        if (!teamsByDtNo[dtNo]) teamsByDtNo[dtNo] = [];
        teamsByDtNo[dtNo].push(player);
      });

      Object.keys(teamsByDtNo)
        .sort((a, b) => Number(a) - Number(b))
        .forEach((dtNo) => {
          const players = teamsByDtNo[dtNo];
          players.sort((a, b) => a.role.localeCompare(b.role));
          players.forEach((player) => {
            const realName    = nameMap[player.name]     || player.name;
            const capInTxt    = player.cap && player.cap !== "" ? player.cap : "-";
            const selectedVal = selectedMap[player.name] ? "1" : "0";
            const sideVal     = sideMap[player.name]     || (player.name.endsWith("_A") ? "team_a" : "team_b");

            lines.push([
              `Team ${dtNo}`, dtNo,
              player.name, realName, player.role || "-",
              capInTxt, selectedVal, sideVal,
            ].join("\t"));
          });
        });

      return lines.join("\n");
    };

    /* ── 15. Transaction ── */
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[currentWallet]] = await conn.query(
        `SELECT available_coins, used_coins, total_coins FROM user_coins WHERE user_id = ? FOR UPDATE`,
        [userId]
      );

      if (!currentWallet || Number(currentWallet.available_coins) < 1) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ success: false, message: "Insufficient coins" });
      }

      await conn.query(
        `UPDATE user_coins SET available_coins = available_coins - 1, used_coins = used_coins + 1 WHERE user_id = ?`,
        [userId]
      );

      if (isFreeTrial) {
        await conn.query(`UPDATE users SET free_trial_used = 1 WHERE id = ?`, [userId]);
      }

      await conn.query(
        `INSERT INTO coins_transactions
           (user_id, coins, amount, transaction_type, opening_points, closing_points, description, status)
         VALUES (?, -1, 0, 'spent', ?, ?, ?, 'success')`,
        [userId, Number(currentWallet.available_coins), Number(currentWallet.available_coins) - 1, `Team generation — match ${match_id}`]
      );

      await conn.query(`DELETE FROM user_teams WHERE match_id = ? AND user_id = ?`, [match_id, userId]);

      /* ── Store teams ── */
      for (const player of uctTeams) {
        const realName    = nameMap[player.name]     || player.name;
        const capValue    = player.cap && player.cap !== "" ? player.cap : null;
        const selected    = selectedMap[player.name] || 0;
        const mandate     = mandateMap[player.name]  || null;

        // ✅ BUG FIX: sideMap use చేయాలి — UCT response team_side "A"/"B" reliable కాదు
        const teamSide    = sideMap[player.name]
                            || (player.team_side === "A" ? "team_a"
                              : player.team_side === "B" ? "team_b"
                              : player.name?.endsWith("_A") ? "team_a" : "team_b");

        const captainMode = capMap[player.name]      || null;

        await conn.query(
          `INSERT INTO user_teams
             (match_id, user_id, dt_no, name, role, cap, original_name,
              selected, mandate, team_side, captain_mode, combo_a, combo_b)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            match_id, userId, player.dt_no,
            player.name, player.role,
            capValue, realName,
            selected, mandate, teamSide, captainMode,
            player.combo_a ?? null,
            player.combo_b ?? null,
          ]
        );
      }

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

      /* ── Email ── */
      let emailSent  = false;
      let emailError = null;

      try {
        const [[user]]      = await db.execute(`SELECT fullname, email FROM users WHERE id = ?`, [userId]);
        const [[matchInfo]] = await db.execute(`SELECT * FROM matches WHERE id = ?`, [match_id]);

        if (user?.email && matchInfo) {
          const uctTxtContent = buildUctTxtContent();
          await sendNoreplyMail({
            to:      user.email,
            subject: "UCT Teams Generated Successfully",
            html:    uctTeamsGeneratedEmailHtml({
              fullname:           user.fullname || "User",
              leagueName:         matchInfo.seriesname   || "-",
              homeTeam:           matchInfo.hometeamname || "-",
              awayTeam:           matchInfo.awayteamname || "-",
              matchDate:          matchInfo.matchdate  ? new Date(matchInfo.matchdate).toLocaleDateString("en-IN")  : "-",
              kickoffTime:        matchInfo.start_time ? new Date(matchInfo.start_time).toLocaleTimeString("en-IN") : "-",
              teamsGenerated:     totalTeams,
              coinsConsumed:      1,
              generatedOn:        new Date().toLocaleString("en-IN"),
              attachmentFileName: `PICK2WIN_UCT_${match_id}.txt`,
            }),
            text: `Your UCT export for match ${match_id} is attached.`,
            attachments: [{
              filename:    `PICK2WIN_UCT_${match_id}.txt`,
              content:     uctTxtContent,
              contentType: "text/plain; charset=utf-8",
            }],
          });
          emailSent = true;
        } else {
          emailError = "User email or match data not found";
        }
      } catch (err) {
        emailError = err.message;
      }

      return res.status(200).json({
        success:         true,
        message:         emailSent
          ? `${totalTeams} teams generated successfully and email sent`
          : `${totalTeams} teams generated successfully`,
        total_teams:     totalTeams,
        squad_size:      totalSquad,
        coins_used:      1,
        coins_remaining: Number(currentWallet.available_coins) - 1,
        free_trial_used: isFreeTrial,
        email_sent:      emailSent,
        ...(emailError && { email_error: emailError }),
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
/* ================= GET MY TEAMS ================= */

export const getMyTeams = async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId      = req.user.id;

    if (!matchId) {
      return res.status(400).json({ success: false, message: "matchId is required" });
    }

    const [[match]] = await db.execute(
      `SELECT hometeamname, awayteamname FROM matches WHERE id = ? LIMIT 1`,
      [matchId]
    );

    const [players] = await db.execute(
      `SELECT
         ut.id, ut.match_id, ut.dt_no, ut.name, ut.original_name,
         ut.role, ut.cap, ut.selected, ut.mandate, ut.team_side,
         ut.provider_player_id, ut.captain_mode,
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
       WHERE ut.match_id = ? AND ut.user_id = ?
       ORDER BY ut.dt_no, ut.role`,
      [matchId, userId]
    );

    if (!players.length) {
      return res.status(404).json({ success: false, message: "No teams found for this match" });
    }

    /* ── Build teams map — dt_no=0 skip ── */
    const teamsMap = {};

    for (const player of players) {
      if (player.dt_no === 0) continue;

      if (!teamsMap[player.dt_no]) teamsMap[player.dt_no] = [];

      /* ── team_side fix: name suffix బట్టి determine ── */
      const teamSide = player.team_side ||
        (player.name && player.name.endsWith("_A") ? "team_a" : "team_b");

      teamsMap[player.dt_no].push({
        id:                 player.id,
        match_id:           player.match_id,
        dt_no:              player.dt_no,
        name:               player.name,
        original_name:      player.original_name,
        role:               player.role,
        cap:                player.cap          || null,
        captain_mode:       player.captain_mode || null,
        selected:           Boolean(player.selected),
        mandate:            player.mandate ? String(player.mandate).trim().toLowerCase() : null,
        team_side:          teamSide,
        provider_player_id: player.provider_player_id || null,
        player_image:       player.player_image || null,
        status:             player.status,
      });
    }

    /* ── mandate_no — dt_no=0 players ── */
    const mandateNoPlayers = players
      .filter((p) => p.dt_no === 0)
      .map((p) => ({
        original_name: p.original_name,
        role:          p.role,
        player_image:  p.player_image || null,
        team_side:     p.team_side || (p.name?.endsWith("_A") ? "team_a" : "team_b"),
        mandate:       "no",
      }));

    const teams = Object.entries(teamsMap).map(([dt_no, teamPlayers]) => ({
      team_no:      Number(dt_no),
      captain:      teamPlayers.find((p) => p.cap === "C")?.original_name  || null,
      vice_captain: teamPlayers.find((p) => p.cap === "VC")?.original_name || null,
      home_players: teamPlayers.filter((p) => p.team_side === "team_a").length,
      away_players: teamPlayers.filter((p) => p.team_side === "team_b").length,
      players:      teamPlayers,
    }));

    /* ── Preview ── */
    const allPlayers = teams.flatMap((t) => t.players);

    const uniqueByName = (arr) =>
      Object.values(arr.reduce((acc, p) => {
        acc[p.original_name] = p;
        return acc;
      }, {}));

    const isCVCMode = allPlayers.some((p) => p.captain_mode === "CVC");

    const substitutes        = uniqueByName(allPlayers.filter((p) => p.selected === true));
    const mandateYes         = uniqueByName(allPlayers.filter((p) => p.mandate?.toLowerCase() === "yes"));
    const mandateNo          = uniqueByName(mandateNoPlayers);
    const captainPlayers     = uniqueByName(allPlayers.filter((p) => p.captain_mode === "C"));
    const viceCaptainPlayers = uniqueByName(allPlayers.filter((p) => p.captain_mode === "VC"));
    const cvcPlayers         = uniqueByName(allPlayers.filter((p) => p.captain_mode === "CVC"));

    const captaincyPool = uniqueByName(
      allPlayers.filter((p) =>
        p.captain_mode === "C" || p.captain_mode === "VC" || p.captain_mode === "CVC"
      )
    );

    const preview = {
      substitutes_count: substitutes.length,
      mandate_yes_count: mandateYes.length,
      mandate_no_count:  mandateNo.length,
      captaincy_count:   captaincyPool.length,
      captaincy_mode:    isCVCMode ? "CVC" : "C & VC",

      substitutes: substitutes.map((p) => ({
        name:      p.original_name,
        role:      p.role,
        image:     p.player_image,
        side:      p.team_side,
        team_name: p.team_side === "team_a" ? match?.hometeamname : match?.awayteamname,
      })),

      mandate_yes: mandateYes.map((p) => ({
        name:      p.original_name,
        role:      p.role,
        image:     p.player_image,
        side:      p.team_side,
        team_name: p.team_side === "team_a" ? match?.hometeamname : match?.awayteamname,
      })),

      mandate_no: mandateNo.map((p) => ({
        name:      p.original_name,
        role:      p.role,
        image:     p.player_image,
        side:      p.team_side,
        team_name: p.team_side === "team_a" ? match?.hometeamname : match?.awayteamname,
      })),

      captains: isCVCMode ? [] : captainPlayers.map((p) => ({
        name:  p.original_name,
        role:  p.role,
        image: p.player_image,
        side:  p.team_side,
      })),

      vice_captains: isCVCMode ? [] : viceCaptainPlayers.map((p) => ({
        name:  p.original_name,
        role:  p.role,
        image: p.player_image,
        side:  p.team_side,
      })),

      cvc_players: isCVCMode ? cvcPlayers.map((p) => ({
        name:  p.original_name,
        role:  p.role,
        image: p.player_image,
        side:  p.team_side,
      })) : [],
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
    return res.status(500).json({ success: false, message: error.message });
  }
};
/* ================= GET MY GENERATED MATCHES ================= */
export const getMyGeneratedMatches = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

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
         COALESCE(m.hometeamname, ht.name,  'TBA') AS home_full_team_name,
         COALESCE(m.awayteamname, awt.name, 'TBA') AS away_full_team_name,
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
        match_id:            r.match_id,
        series_name:         r.series_name,
        home_team:           r.home_team,
        away_team:           r.away_team,
        home_full_team_name: r.home_full_team_name,
        away_full_team_name: r.away_full_team_name,
        home_logo:           r.home_logo,
        away_logo:           r.away_logo,
        start_time:          r.start_time,
        status:              r.status,
        teams_generated:     r.total_teams,
        generated_at:        r.generated_at,
      })),
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET MY GENERATED TEAMS ================= */
export const getMyGeneratedTeams = async (req, res) => {
  try {
    const userId  = req.user.id;
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
       WHERE ut.user_id  = ? AND ut.match_id = ?
       GROUP BY ut.id
       ORDER BY ut.id ASC`,
      [userId, matchId]
    );

    if (!teams.length) return res.json({ success: true, total: 0, data: [] });

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

/* ================= GET TEAM PLAYERS ================= */
export const getTeamPlayers = async (req, res) => {
  try {
    const userId  = req.user.id;
    const { teamId } = req.params;

    const [[team]] = await db.execute(
      `SELECT id, name AS team_name, match_id, team_side, created_at
       FROM user_teams WHERE id = ? LIMIT 1`,
      [teamId]
    );

    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

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

     