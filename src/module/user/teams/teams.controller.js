import db from "../../../config/db.js";

import axios from "axios";

export const generateTeams = async (req, res) => {
  try {
    const { match_id, team_a, team_b } = req.body;

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

    const rows = [];

    for (const player of team_a) {
      rows.push([
        match_id,
        "team_a",
        player.name,
        player.role,
        player.mandate || null,
        player.captain || null,
      ]);
    }

    for (const player of team_b) {
      rows.push([
        match_id,
        "team_b",
        player.name,
        player.role,
        player.mandate || null,
        player.captain || null,
      ]);
    }

    await db.query(
      `INSERT INTO user_teams
       (match_id, team_side, name, role, mandate, captain)
       VALUES ?`,
      [rows]
    );

    // Send to UCT API
    try {
      const response = await axios.post(
        `${process.env.UCT_API}/football/teams`,
        {
          match_id,
          team_a,
          team_b,
        }
      );

      console.log("UCT API Response:", response.data);
    } catch (apiError) {
      console.error(
        "UCT API Error:",
        apiError.response?.data || apiError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: "Teams created successfully",
      total_players: rows.length,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
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





// import {
//   generateTeamsService,
//   getMyTeamsWithPlayersService,
// } from "./teams.service.js";

// const KNOWN_ERRORS = [
//   "No players provided",
//   "Match not found",
//   "Team generation is closed",
//   "Teams already generated",
//   "Invalid players",
//   "Binary generated no teams",
// ];

// export const generateTeams = async (req, res) => {
//   try {
//     if (!req.user?.id)
//       return res.status(401).json({ success: false, message: "User not authenticated" });

//     const { matchId, team_a, team_b } = req.body;

//     if (!matchId)
//       return res.status(400).json({ success: false, message: "matchId is required" });
//     if (!Array.isArray(team_a) || !team_a.length)
//       return res.status(400).json({ success: false, message: "team_a is required" });
//     if (!Array.isArray(team_b) || !team_b.length)
//       return res.status(400).json({ success: false, message: "team_b is required" });

//     const result = await generateTeamsService(
//       req.user.id,
//       Number(matchId),
//       team_a,
//       team_b
//     );

//     return res.status(201).json(result);

//   } catch (error) {
//     if (KNOWN_ERRORS.some(e => error.message?.startsWith(e)))
//       return res.status(400).json({ success: false, message: error.message });

//     console.error("[generateTeams]", error);
//     return res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

// export const getMyTeams = async (req, res) => {
//   try {
//     const userId    = req.user?.id;
//     const { matchId }    = req.params;
//     const { contestId }  = req.query;

//     if (!userId)
//       return res.status(401).json({ success: false, message: "User not authenticated" });

//     const teams = await getMyTeamsWithPlayersService(userId, matchId, contestId);

//     return res.status(200).json({
//       success: true,
//       total:   teams.length,
//       data:    teams,
//       ...(teams.length === 0 && { message: "No teams found" }),
//     });

//   } catch (error) {
//     console.error("[getMyTeams]", error);
//     return res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };