import db from "../../../config/db.js";

export const getMatchTimeline = async (req, res) => {
  try {
    const { matchId } = req.params;

    const [[match]] = await db.execute(
      `SELECT id, start_time, lineupavailable, status FROM matches WHERE id = ? AND is_active = 1`,
      [matchId]
    );

    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    const timeline = calculateTimeline(match);

    res.json({ success: true, data: timeline });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── Timeline calculate ── */
const calculateTimeline = (match) => {
  const now       = new Date();
  const kickoff   = new Date(match.start_time);
  const minsLeft  = Math.round((kickoff - now) / (1000 * 60));

  // Match already finished
  if (match.status === "RESULT") {
    return {
      matchId:       match.id,
      status:        "RESULT",
      timelineStage: null,
      minsToKickoff: null,
      kickoff:       kickoff,
      lineupAvailable: Boolean(match.lineupavailable),
    };
  }

  // Lineup not available yet
  if (!match.lineupavailable) {
    return {
      matchId:         match.id,
      status:          match.status,
      timelineStage:   "WAITING_LINEUP",
      label:           "Waiting for lineups",
      minsToKickoff:   minsLeft,
      kickoff:         kickoff,
      lineupAvailable: false,
    };
  }

  // Lineup available — calculate stage
  let stage;
  if      (minsLeft > 60)  stage = { key: "LINEUPS_OUT",      label: "Lineups Out",        mins: "~75 MIN", color: "yellow" };
  else if (minsLeft > 45)  stage = { key: "USERS_ADJUSTING",  label: "Users Adjusting",    mins: "~60 MIN", color: "yellow" };
  else if (minsLeft > 30)  stage = { key: "CAPTAIN_ROTATIONS",label: "Captain Rotations",  mins: "~45 MIN", color: "yellow" };
  else if (minsLeft > 15)  stage = { key: "DEADLINE_PRESSURE",label: "Deadline Pressure",  mins: "~30 MIN", color: "red"    };
  else if (minsLeft > 0)   stage = { key: "CHAOS_ZONE",       label: "Chaos Zone",         mins: "~15 MIN", color: "red"    };
  else                     stage = { key: "FANTASY_LOCK",     label: "Fantasy Lock",       mins: "KICKOFF", color: "red"    };

  return {
    matchId:         match.id,
    status:          match.status,
    timelineStage:   stage.key,
    label:           stage.label,
    minsToKickoff:   minsLeft,
    kickoff:         kickoff,
    lineupAvailable: true,
    color:           stage.color,
  };
};