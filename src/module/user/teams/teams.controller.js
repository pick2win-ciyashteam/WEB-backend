import {
  generateTeamsService,
  getMyTeamsWithPlayersService,
} from "./teams.service.js";

const KNOWN_ERRORS = [
  "No players provided",
  "Match not found",
  "Team generation is closed",
  "Teams already generated",
  "Invalid players",
  "Binary generated no teams",
];

export const generateTeams = async (req, res) => {
  try {
    if (!req.user?.id)
      return res.status(401).json({ success: false, message: "User not authenticated" });

    const { matchId, team_a, team_b } = req.body;

    if (!matchId)
      return res.status(400).json({ success: false, message: "matchId is required" });
    if (!Array.isArray(team_a) || !team_a.length)
      return res.status(400).json({ success: false, message: "team_a is required" });
    if (!Array.isArray(team_b) || !team_b.length)
      return res.status(400).json({ success: false, message: "team_b is required" });

    const result = await generateTeamsService(
      req.user.id,
      Number(matchId),
      team_a,
      team_b
    );

    return res.status(201).json(result);

  } catch (error) {
    if (KNOWN_ERRORS.some(e => error.message?.startsWith(e)))
      return res.status(400).json({ success: false, message: error.message });

    console.error("[generateTeams]", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getMyTeams = async (req, res) => {
  try {
    const userId    = req.user?.id;
    const { matchId }    = req.params;
    const { contestId }  = req.query;

    if (!userId)
      return res.status(401).json({ success: false, message: "User not authenticated" });

    const teams = await getMyTeamsWithPlayersService(userId, matchId, contestId);

    return res.status(200).json({
      success: true,
      total:   teams.length,
      data:    teams,
      ...(teams.length === 0 && { message: "No teams found" }),
    });

  } catch (error) {
    console.error("[getMyTeams]", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};