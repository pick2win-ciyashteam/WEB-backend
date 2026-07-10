// teams.controller.js
import db from "../../../config/db.js";
import axios from "axios";
import { sendNoreplyMail, uctTeamsGeneratedEmailHtml } from "../../../utils/mailer.js";
import { getUCTEndpoint, getValidSportsAndGames } from "../../../utils/uctApi.js";
import { logUserActivity } from "../../../utils/activity.logger.js";
import { sendPushToUser } from "../../../utils/notification.js";

/* ================= GENERATE TEAMS ================= */

export const generateTeams = async (req, res) => {

  const generationStartTime = Date.now();

  try {
    const userId = req.user.id;
    const { match_id, team_a, team_b, game, cap, sport } = req.body;

    /* ── 1. Validate input ── */
    if (!match_id || !team_a || !team_b) {
      return res.status(400).json({ success: false, message: "match_id, team_a, team_b required" });
    }
    if (!Array.isArray(team_a) || !Array.isArray(team_b)) {
      return res.status(400).json({ success: false, message: "team_a and team_b must be arrays" });
    }
    if (team_a.length < 1 || team_b.length < 1) {
      return res.status(400).json({ success: false, message: "team_a and team_b must have at least 1 player each" });
    }

    const gameName  = game  ? String(game).toLowerCase().trim()  : "football";
    const sportName = sport ? String(sport).toLowerCase().trim() : "football";

    const { sports: validSports, games: validGames } = getValidSportsAndGames();
    if (!validSports.includes(sportName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid sport '${sportName}'. Supported sports: ${validSports.join(", ")}`,
      });
    }
    if (!validGames.includes(gameName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid game '${gameName}'. Supported games: ${validGames.join(", ")}`,
      });
    }

    const capValue = cap !== undefined && cap !== null ? Number(cap) : null;
    const uctUrl   = getUCTEndpoint(gameName, sportName);

    if (!uctUrl) {
      return res.status(400).json({ success: false, message: `UCT endpoint not configured for game: ${gameName}` });
    }

    /* ── 2. Remove duplicates ── */
    const uniqueTeamA = team_a.filter((p, idx, arr) => arr.findIndex((x) => x.name === p.name) === idx);
    const uniqueTeamB = team_b.filter((p, idx, arr) => arr.findIndex((x) => x.name === p.name) === idx);

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
          match.status === "LIVE" ? "Match is already in progress. Teams cannot be generated." :
            match.status === "RESULT" ? "Match has ended. Teams cannot be generated." :
              "Teams can only be generated for upcoming matches.",
      });
    }
    if (Number(match.lineupavailable) !== 1) {
      return res.status(400).json({ success: false, message: "Playing XI not announced yet." });
    }

    /* ── 4. Already generated ── */
    const [[existing]] = await db.execute(
      `SELECT id FROM match_generation_log
       WHERE match_id = ? AND user_id = ? AND game = ?`,
      [match_id, userId, gameName]
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Teams already generated for ${gameName} in this match`,
      });
    }

    /* ── 5. Coins check ── */
    const [[wallet]] = await db.execute(
      `SELECT available_coins, used_coins, total_coins FROM user_coins WHERE user_id = ?`,
      [userId]
    );
    if (!wallet || Number(wallet.available_coins) < 1) {
      return res.status(400).json({ success: false, message: "Insufficient coins." });
    }

    /* ── 6. Free trial check ── */
    const [[userRow]] = await db.execute(`SELECT free_trial_used FROM users WHERE id = ?`, [userId]);
    const isFreeTrial = userRow && userRow.free_trial_used === 0;

    /* ── 7. Subscription check ── */
    let subscriptionId = null;
    if (!isFreeTrial) {
      const [[subscription]] = await db.execute(
        `SELECT id, plan_name, expiry_date, matches_allowed, matches_used
         FROM user_subscriptions
         WHERE user_id = ? AND status = 'active' AND expiry_date > NOW()
         ORDER BY id DESC LIMIT 1`,
        [userId]
      );
      if (!subscription) return res.status(400).json({ success: false, message: "No active subscription found." });
      if (Number(subscription.matches_used) >= Number(subscription.matches_allowed)) {
        return res.status(400).json({
          success: false,
          message: `Match limit reached. Your ${subscription.plan_name} allows ${subscription.matches_allowed} matches.`,
        });
      }
      subscriptionId = subscription.id;
    }

    /* ── 8. Convert real names → coded names ── */
    const toUCT = (players, side) => {
      const counters = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      return players.map((p) => {
        const role = p.role || "MID";
        counters[role] = (counters[role] || 0) + 1;
        let codedName;
        if (role === "GK") {
          codedName = `GK_${side}`;
        } else {
          const prefix = role === "DEF" ? "D" : role === "MID" ? "M" : "F";
          codedName = `${prefix}${counters[role]}_${side}`;
        }
        return {
          name: codedName,
          role,
          captain: p.captain || null,
          mandate: p.mandate ? String(p.mandate).trim().toUpperCase() : null,
          salary: p.salary || null,
          _original: p.name,
          _side: side === "A" ? "team_a" : "team_b",
        };
      });
    };

    const uctTeamA  = toUCT(uniqueTeamA, "A");
    const uctTeamB  = toUCT(uniqueTeamB, "B");
    const allMapped = [...uctTeamA, ...uctTeamB];

    /* ── 9. Build UCT payload ── */
    const buildUCTPlayer = (p) => {
      const obj = { name: p.name, role: p.role };
      if (p.captain === "C") obj.captain = "C";
      if (p.captain === "VC") obj.captain = "VC";
      if (p.captain === "CVC") obj.captain = "CVC";
      if (p.mandate && p.role !== "GK") obj.mandate = p.mandate;
      if (p.salary !== null && p.salary !== undefined) obj.salary = p.salary;
      return obj;
    };

    const uctPayload = {
      team_a: uctTeamA.map(buildUCTPlayer),
      team_b: uctTeamB.map(buildUCTPlayer),
      ...(capValue !== null && { cap: capValue }),
    };

    /* ── 10. Fetch substitutes ── */
    const [substituteRows] = await db.execute(
      `SELECT player_name FROM match_players WHERE match_id = ? AND is_substitute = 1`,
      [match_id]
    );
    const substituteNames = new Set(substituteRows.map((r) => r.player_name));

    /* ── 11. Build maps ── */
    const nameMap = {};
    const capMap = {};
    const mandateMap = {};
    const sideMap = {};
    const selectedMap = {};
    const salaryMap = {};

    allMapped.forEach((p) => {
      nameMap[p.name] = p._original || p.name;
      capMap[p.name] = p.captain || null;
      mandateMap[p.name] = p.mandate || null;
      sideMap[p.name] = p._side;
      selectedMap[p.name] = substituteNames.has(p._original) ? 1 : 0;
      salaryMap[p.name] = p.salary || null;
    });

    const mandateNoPlayers = allMapped.filter((p) => p.mandate === "NO");

    /* ── 12. Call UCT API ── */
    let uctTeams = [];

    try {
      const response = await axios.post(uctUrl, uctPayload, {
        headers: { "Content-Type": "application/json", "x-api-key": process.env.UCT_API_KEY },
        timeout: 60000,
      });

      const raw = response.data;
      if (Array.isArray(raw?.teams)) uctTeams = raw.teams;
      else if (Array.isArray(raw)) uctTeams = raw;
      else uctTeams = [];
    } catch (apiError) {
      console.error("❌ UCT API FAILED:", apiError.message, apiError.response?.data);
      const uctDetail = apiError.response?.data?.detail || "";
      let userMessage = "Team generation failed. Please check your squad and try again.";
      if (uctDetail.toLowerCase().includes("team generation failed")) {
        userMessage = "Invalid squad configuration. Please ensure: each team has exactly 1 GK, max 4 DEF, max 4 MID, max 4 FWD, captain pool has 2–6 players, and squad total is between 10–22 players.";
      } else if (uctDetail.toLowerCase().includes("captain")) {
        userMessage = "Captain pool is invalid. Please select valid captain candidates and try again.";
      } else if (uctDetail.toLowerCase().includes("mandate")) {
        userMessage = "Mandatory player (M-YES) selection is invalid. Maximum 2 allowed (max 1 GK).";
      } else if (uctDetail.toLowerCase().includes("salary") || uctDetail.toLowerCase().includes("cap")) {
        userMessage = "Salary cap configuration is invalid. Please check player salaries and cap value.";
      } else if (uctDetail) {
        userMessage = `Team generation failed: ${uctDetail}`;
      }

      await sendPushToUser({
        userId,
        title: "UCT Generation Failed",
        body: "We couldn't generate your teams.",
        data: { type: "uct_generation_failed", match_id, game: gameName, sport: sportName },
      });

      return res.status(400).json({ success: false, message: userMessage });
    }

    const generationTimeMs = Date.now() - generationStartTime;

    if (!uctTeams.length) {
      return res.status(400).json({ success: false, message: "UCT API returned no teams" });
    }

    const totalTeams = [...new Set(uctTeams.map((p) => p.dt_no))].length;

    /* ── 13. Transaction ── */
    let coinsRemaining = 0;

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
      } else {
        await conn.query(
          `UPDATE user_subscriptions SET matches_used = matches_used + 1 WHERE id = ?`,
          [subscriptionId]
        );
      }

      await conn.query(
        `INSERT INTO coins_transactions
           (user_id, coins, amount, transaction_type, opening_points, closing_points, description, status, match_id)
         VALUES (?, -1, 0, 'spent', ?, ?, ?, 'success', ?)`,
        [userId, Number(currentWallet.available_coins), Number(currentWallet.available_coins) - 1,
          `Team generation — match ${match_id} — ${sportName}/${gameName}`, match_id]
      );

      await conn.query(
        `DELETE FROM user_teams WHERE match_id = ? AND user_id = ? AND game = ?`,
        [match_id, userId, gameName]
      );

      /* ── Store UCT teams ── */
      for (const player of uctTeams) {
        const realName = nameMap[player.name] || player.name;
        const playerCap = player.cap && player.cap !== "" ? player.cap : null;
        const selected = selectedMap[player.name] || 0;
        const mandate = mandateMap[player.name] || null;
        const teamSide = sideMap[player.name]
          || (player.team_side === "A" ? "team_a"
            : player.team_side === "B" ? "team_b"
              : player.name?.endsWith("_A") ? "team_a" : "team_b");
        const captainMode = capMap[player.name] || null;
        const salary = salaryMap[player.name] || player.salary || null;

        await conn.query(
          `INSERT INTO user_teams
             (match_id, user_id, dt_no, name, role, cap, original_name,
              selected, mandate, team_side, captain_mode, game, salary)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [match_id, userId, player.dt_no, player.name, player.role, playerCap, realName,
            selected, mandate, teamSide, captainMode, gameName, salary]
        );
      }

      /* ── Store mandate="NO" players ── */
      for (const p of mandateNoPlayers) {
        const realName = nameMap[p.name] || p.name;
        await conn.query(
          `INSERT INTO user_teams
             (match_id, user_id, dt_no, name, role, cap, original_name,
              selected, mandate, team_side, captain_mode, game, salary)
           VALUES (?, ?, 0, ?, ?, NULL, ?, 0, 'NO', ?, NULL, ?, NULL)`,
          [match_id, userId, p.name, p.role, realName, sideMap[p.name] || null, gameName]
        );
      }

      await conn.query(
        `INSERT INTO match_generation_log
           (match_id, user_id, total_teams, generation_time_ms, status, game)
         VALUES (?, ?, ?, ?, 'success', ?)
         ON DUPLICATE KEY UPDATE
           total_teams        = VALUES(total_teams),
           generation_time_ms = VALUES(generation_time_ms),
           status             = 'success',
           created_at         = NOW()`,
        [match_id, userId, totalTeams, generationTimeMs, gameName]
      );

      coinsRemaining = Number(currentWallet.available_coins) - 1;

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await sendPushToUser({
      userId,
      title: "Coin Deducted",
      body: "1 coin has been deducted following a successful UCT generation.",
      data: { type: "coin_deducted", coins: 1, closing_coins: coinsRemaining },
    });

    if (coinsRemaining <= 2) {
      await sendPushToUser({
        userId,
        title: "Low Coin Balance",
        body: "Your coin balance is running low.",
        data: { type: "low_coin_balance", available_coins: coinsRemaining },
      });
    }

    await sendPushToUser({
      userId,
      title: "Teams Ready",
      body: `Your ${totalTeams} generated teams are now available in My Teams.`,
      data: { type: "teams_ready", match_id, total_teams: totalTeams, game: gameName, sport: sportName },
    });

    /* ── Email + activity log (best-effort, outside the transaction) ── */
    let emailSent = false;
    let emailError = null;

    try {
      const [[user]] = await db.execute(
        `SELECT fullname, email FROM users WHERE id = ? LIMIT 1`,
        [userId]
      );

      const [[matchInfo]] = await db.execute(
        `SELECT
                m.matchdate,
                m.start_time,
                m.hometeamname,
                m.awayteamname,
                s.name AS seriesname
            FROM matches m
            LEFT JOIN series s
              ON CAST(s.seriesid AS UNSIGNED) = m.series_id
            WHERE m.id = ?
            LIMIT 1`,
        [match_id]
      );

      if (user?.email && matchInfo) {
        await sendNoreplyMail({
          to: user.email,
          subject: `UCT Teams Generated — ${sportName.toUpperCase()}/${gameName.toUpperCase()}`,
          html: uctTeamsGeneratedEmailHtml({
            fullname: user.fullname || "User",
            leagueName: matchInfo.seriesname || "-",
            homeTeam: matchInfo.hometeamname || "-",
            awayTeam: matchInfo.awayteamname || "-",
            matchDate: matchInfo.matchdate
              ? new Date(matchInfo.matchdate).toLocaleDateString("en-IN")
              : "-",
            kickoffTime: matchInfo.start_time
              ? new Date(matchInfo.start_time).toLocaleTimeString("en-IN")
              : "-",
            teamsGenerated: totalTeams,
            coinsConsumed: 1,
            generatedOn: new Date().toLocaleString("en-IN"),
          }),
          text: `Your UCT teams have been generated successfully for match ${match_id}.`,
        });

        emailSent = true;
      } else {
        emailError = "User email or match data not found";
      }
    } catch (err) {
      emailError = err.message;
    }

    await logUserActivity({
      userId,
      category: "teams",
      action: "teams_generated",
      details: `${totalTeams} teams generated for match ${match_id}`,
      req,
      metadata: {
        match_id,
        total_teams: totalTeams,
        generation_time_ms: generationTimeMs,
        game: gameName,
        sport: sportName,
        coins_used: 1,
        free_trial_used: Boolean(isFreeTrial),
      },
    });

    return res.status(200).json({
      success: true,
      message: `${totalTeams} teams generated for ${sportName}/${gameName} successfully`,
      total_teams: totalTeams,
      generation_time_ms: generationTimeMs,
      game: gameName,
      sport: sportName,
      coins_used: 1,
      coins_remaining: coinsRemaining,
      free_trial_used: isFreeTrial,
      email_sent: emailSent,
      ...(emailError && { email_error: emailError }),
    });

  } catch (err) {
    console.error("generateTeams error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ================= GET MY TEAMS ================= */

export const getMyTeams = async (req, res) => {
  try {
    const { matchId, game, sport } = req.params;
    const userId = req.user.id;
    const gameName = game ? String(game).toLowerCase().trim() : null;
    const sportName = sport ? String(sport).toLowerCase().trim() : null;

    /* ───────── VALIDATE SPORT & GAME ───────── */

    const { sports: validSports, games: validGames } = getValidSportsAndGames();

    if (sportName && !validSports.includes(sportName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid sport '${sportName}'. Supported sports: ${validSports.join(", ")}`
      });
    }

    if (gameName && !validGames.includes(gameName)) {
      return res.status(400).json({
        success: false,
        message: `Invalid game '${gameName}'. Supported games: ${validGames.join(", ")}`
      });
    }

    if (!matchId) {
      return res.status(400).json({ success: false, message: "matchId is required" });
    }

    const [[match]] = await db.execute(
      `SELECT id, hometeamname, awayteamname FROM matches WHERE id = ? LIMIT 1`,
      [matchId]
    );

    if (!match) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }

    /* ── Fetch players ── */
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
         ut.captain_mode,
         ut.game,
         ut.salary,
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
         ${gameName ? "AND ut.game = ?" : ""}
       ORDER BY ut.dt_no ASC, ut.role ASC`,
      gameName ? [matchId, userId, gameName] : [matchId, userId]
    );

    if (!players.length) {
      return res.status(404).json({ success: false, message: "No teams found for this match" });
    }

    /* ── Detect game from data ── */
    const detectedGame = gameName || players.find((p) => p.game)?.game || "football";
    const detectedSport = sportName || "football";

    /* ── Get generation time ── */
    const [[generationLog]] = await db.execute(
      `SELECT generation_time_ms
   FROM match_generation_log
   WHERE match_id = ?
     AND user_id = ?
     AND game = ?
   LIMIT 1`,
      [matchId, userId, detectedGame]
    );

    /* ── FanDuel/DraftKings = salary based, Sorare = captain based ── */
    const isSalaryGame = ["fanduel", "draftkings"].includes(detectedGame);
    const isCaptainGame = ["sorare", "football"].includes(detectedGame);

    /* ── Build teams map — dt_no=0 skip ── */
    const teamsMap = {};

    for (const player of players) {
      if (player.dt_no === 0) continue;

      if (!teamsMap[player.dt_no]) teamsMap[player.dt_no] = [];

      const teamSide = player.team_side ||
        (player.name && player.name.endsWith("_A") ? "team_a" : "team_b");

      teamsMap[player.dt_no].push({
        id: player.id,
        match_id: player.match_id,
        dt_no: player.dt_no,
        name: player.name,
        original_name: player.original_name,
        role: player.role,
        cap: player.cap || null,
        captain_mode: player.captain_mode || null,
        selected: Boolean(player.selected),
        mandate: player.mandate ? String(player.mandate).trim().toLowerCase() : null,
        team_side: teamSide,
        team_name: teamSide === "team_a" ? match.hometeamname : match.awayteamname,
        provider_player_id: player.provider_player_id || null,
        player_image: player.player_image || null,
        status: player.status,
        game: player.game || null,
        salary: player.salary !== null ? Number(player.salary) : null,
      });
    }

    /* ── mandate_no ── */
    const mandateNoPlayers = players
      .filter((p) => p.dt_no === 0)
      .map((p) => ({
        original_name: p.original_name,
        role: p.role,
        player_image: p.player_image || null,
        team_side: p.team_side || (p.name?.endsWith("_A") ? "team_a" : "team_b"),
        team_name: (p.team_side || "") === "team_a" ? match.hometeamname : match.awayteamname,
        salary: p.salary !== null ? Number(p.salary) : null,
        mandate: "no",
      }));

    /* ── Build teams array ── */
    const teams = Object.entries(teamsMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([dt_no, teamPlayers]) => {
        const homeCount = teamPlayers.filter((p) => p.team_side === "team_a").length;
        const awayCount = teamPlayers.filter((p) => p.team_side === "team_b").length;
        const totalSalary = teamPlayers.reduce((sum, p) => sum + (p.salary || 0), 0);

        const captain = isCaptainGame
          ? teamPlayers.find((p) => p.cap === "C")?.original_name || null
          : null;
        const vice_captain = isCaptainGame
          ? teamPlayers.find((p) => p.cap === "VC")?.original_name || null
          : null;

        return {
          team_no: Number(dt_no),
          captain,
          vice_captain,
          home_players: homeCount,
          away_players: awayCount,
          total_salary: isSalaryGame ? Number(totalSalary.toFixed(2)) : null,
          players: teamPlayers,
        };
      });

    /* ── Preview ── */
    const allPlayers = teams.flatMap((t) => t.players);

    const uniqueByName = (arr) =>
      Object.values(arr.reduce((acc, p) => {
        acc[p.original_name] = p;
        return acc;
      }, {}));

    const substitutes = uniqueByName(allPlayers.filter((p) => p.selected === true));
    const mandateYes = uniqueByName(allPlayers.filter((p) => p.mandate?.toLowerCase() === "yes"));
    const mandateNo = uniqueByName(mandateNoPlayers);

    const isCVCMode = isCaptainGame && allPlayers.some((p) => p.captain_mode === "CVC");
    const captainPlayers = isCaptainGame ? uniqueByName(allPlayers.filter((p) => p.captain_mode === "C")) : [];
    const viceCaptainPlayers = isCaptainGame ? uniqueByName(allPlayers.filter((p) => p.captain_mode === "VC")) : [];
    const cvcPlayers = isCaptainGame ? uniqueByName(allPlayers.filter((p) => p.captain_mode === "CVC")) : [];

    const captaincyPool = isCaptainGame
      ? uniqueByName(allPlayers.filter((p) =>
        p.captain_mode === "C" || p.captain_mode === "VC" || p.captain_mode === "CVC"
      ))
      : [];

    const preview = {
      game: detectedGame,
      sport: detectedSport,
      substitutes_count: substitutes.length,
      mandate_yes_count: mandateYes.length,
      mandate_no_count: mandateNo.length,

      substitutes: substitutes.map((p) => ({
        name: p.original_name,
        role: p.role,
        image: p.player_image,
        side: p.team_side,
        team_name: p.team_name,
        salary: p.salary,
      })),

      mandate_yes: mandateYes.map((p) => ({
        name: p.original_name,
        role: p.role,
        image: p.player_image,
        side: p.team_side,
        team_name: p.team_name,
        salary: p.salary,
      })),

      mandate_no: mandateNo.map((p) => ({
        name: p.original_name,
        role: p.role,
        image: p.player_image,
        side: p.team_side,
        team_name: p.team_name,
        salary: p.salary,
      })),

      ...(isCaptainGame ? {
        captaincy_count: captaincyPool.length,
        captaincy_mode: isCVCMode ? "CVC" : "C & VC",

        captains: isCVCMode ? [] : captainPlayers.map((p) => ({
          name: p.original_name, role: p.role, image: p.player_image,
          side: p.team_side, team_name: p.team_name,
        })),

        vice_captains: isCVCMode ? [] : viceCaptainPlayers.map((p) => ({
          name: p.original_name, role: p.role, image: p.player_image,
          side: p.team_side, team_name: p.team_name,
        })),

        cvc_players: isCVCMode ? cvcPlayers.map((p) => ({
          name: p.original_name, role: p.role, image: p.player_image,
          side: p.team_side, team_name: p.team_name,
        })) : [],
      } : {
        captaincy_count: 0,
        captaincy_mode: "NONE",
        captains: [],
        vice_captains: [],
        cvc_players: [],
      }),
    };

    return res.status(200).json({
      success: true,
      match_id: Number(matchId),
      game: detectedGame,
      sport: detectedSport,
      home_team: match.hometeamname,
      away_team: match.awayteamname,
      total_teams: teams.length,
      generation_time_ms: generationLog?.generation_time_ms || 0,
      generation_time_seconds: Number(
        ((generationLog?.generation_time_ms || 0) / 1000).toFixed(2)
      ),

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
      total: rows.length,
      data: rows.map((r) => ({
        match_id: r.match_id,
        series_name: r.series_name,
        home_team: r.home_team,
        away_team: r.away_team,
        home_full_team_name: r.home_full_team_name,
        away_full_team_name: r.away_full_team_name,
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

/* ================= GET TEAM PLAYERS ================= */
export const getTeamPlayers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { teamId } = req.params;

    /* ── Look up the requested team, scoped to the requesting user ── */
    const [[team]] = await db.execute(
      `SELECT id, match_id, dt_no, game, team_side
       FROM user_teams
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [teamId, userId]
    );

    if (!team) return res.status(404).json({ success: false, message: "Team not found" });

    /* ── A generated team = same match + user + game + dt_no (spans both sides) ── */
    const [players] = await db.execute(
      `SELECT id, name, original_name, role, mandate, cap, captain_mode, team_side, salary
       FROM user_teams
       WHERE match_id = ?
         AND user_id  = ?
         AND game     = ?
         AND dt_no    = ?
       ORDER BY FIELD(role, 'GK', 'DEF', 'MID', 'FWD')`,
      [team.match_id, userId, team.game, team.dt_no]
    );

    res.json({
      success: true,
      team_id: team.id,
      team_no: team.dt_no,
      match_id: team.match_id,
      game: team.game,
      total: players.length,
      captain: players.find((p) => p.cap === "C") || null,
      vice_captain: players.find((p) => p.cap === "VC") || null,
      players,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
