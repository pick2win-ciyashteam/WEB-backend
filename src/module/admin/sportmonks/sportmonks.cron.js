// import cron from "node-cron";
// import db   from "../../../config/db.js";
// import {
//   syncPlayingXIService,
  
// } from "./sportmonks.service.js";

// /* ================= HELPERS ================= */
// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// const formatDateTime = (date) => {
//   return date.toISOString().slice(0, 19).replace("T", " ");
// };

// const getISTHour = () => {
//   const istMs = Date.now() + 5.5 * 60 * 60 * 1000;
//   return new Date(istMs).getUTCHours();
// };

// const isLiveWindow = () => {
//   const h = getISTHour();
//   return h >= 14 || h <= 2; // IST 14:00 – 02:00
// };

// /* ================= JOB 1 — LINEUP SYNC — every 5 mins ================= */
// const syncLineups = async () => {
//   console.log("⏰ [CRON] Lineup sync started:", new Date().toISOString());
//   try {
//     const now             = new Date();
//     const ninetyMinsLater = new Date(now.getTime() + 90 * 60 * 1000);

//     const [matches] = await db.query(
//       `SELECT id, provider_match_id, start_time, lineup_status, status
//        FROM matches
//        WHERE is_active = 1
//          AND lineup_status != 'confirmed'
//          AND (
//            (status = 'UPCOMING' AND start_time <= ?)
//            OR status = 'LIVE'
//          )
//        ORDER BY start_time ASC`,
//       [formatDateTime(ninetyMinsLater)]
//     );

//     if (!matches.length) {
//       console.log("✅ [CRON] No matches needing lineup sync");
//       return;
//     }

//     console.log(`📋 [CRON] Lineup check for ${matches.length} match(es)`);

//     for (const match of matches) {
//       try {
//         const result = await syncPlayingXIService(match.provider_match_id);
//         if (result.reason) {
//           console.log(`⏳ [CRON] Match ${match.provider_match_id} — ${result.reason}`);
//         } else {
//           console.log(`✅ [CRON] Match ${match.provider_match_id} — ${result.count} players confirmed`);
//         }
//         await sleep(1000);
//       } catch (err) {
//         console.error(`❌ [CRON] Lineup failed for ${match.provider_match_id}:`, err.message);
//       }
//     }
//   } catch (err) {
//     console.error("❌ [CRON] syncLineups failed:", err.message);
//   }
// };

// /* ================= JOB 2 — MATCH STATUS — every 5 mins ================= */
// const syncMatchStatuses = async () => {
//   console.log("⏰ [CRON] Status sync started:", new Date().toISOString());
//   try {
//     const [toLive] = await db.query(
//       `UPDATE matches SET status = 'LIVE'
//        WHERE is_active = 1
//          AND status = 'UPCOMING'
//          AND start_time <= NOW()`
//     );

//     const [toResult] = await db.query(
//       `UPDATE matches SET status = 'RESULT'
//        WHERE is_active = 1
//          AND status IN ('UPCOMING', 'LIVE')
//          AND start_time <= DATE_SUB(NOW(), INTERVAL 150 MINUTE)`
//     );

//     console.log(
//       `✅ [CRON] UPCOMING→LIVE: ${toLive.affectedRows} | LIVE→RESULT: ${toResult.affectedRows}`
//     );
//   } catch (err) {
//     console.error("❌ [CRON] syncMatchStatuses failed:", err.message);
//   }
// };

// /* ================= JOB 3 — PLAYER STATS — every 5 mins ================= */
// const getMatchesToSync = async () => {
//   const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
//     .toISOString()
//     .slice(0, 19)
//     .replace("T", " ");

//   const [rows] = await db.query(
//     `SELECT id, provider_match_id, status, start_time
//      FROM matches
//      WHERE
//        status IN ('live', 'inplay', 'LIVE')
//        OR (
//          status IN ('finished', 'completed', 'RESULT')
//          AND stats_final_synced = 0
//          AND start_time >= ?
//        )
//      ORDER BY start_time ASC`,
//     [twoHoursAgo]
//   );
//   return rows;
// };

// const markFinalSynced = async (matchId) => {
//   await db.query(
//     `UPDATE matches SET stats_final_synced = 1 WHERE id = ?`,
//     [matchId]
//   );
// };

// const syncMatchStats = async (match) => {
//   try {
//     const result = await syncAllPlayerStatsService(match.id);

//     if (result.reason) {
//       console.log(`  [SKIP] Match ${match.id}: ${result.reason}`);
//       return;
//     }

//     console.log(
//       `  [OK]   Match ${match.id} — ${result.count} saved, ${result.skipped?.length || 0} skipped`
//     );

//     const finishedStatuses = ["finished", "completed", "result"];
//     if (finishedStatuses.includes(match.status?.toLowerCase())) {
//       await markFinalSynced(match.id);
//       console.log(`  [DONE] Match ${match.id} marked final-synced`);
//     }
//   } catch (err) {
//     console.error(`  [ERR]  Match ${match.id}: ${err.message}`);
//   }
// };

// const syncPlayerStatsJob = async () => {
//   try {
//     if (!isLiveWindow()) {
//       /* ── Outside live window — only unsynced finished matches ── */
//       const [rows] = await db.query(
//         `SELECT id, provider_match_id, status
//          FROM matches
//          WHERE stats_final_synced = 0
//            AND status IN ('finished', 'completed', 'RESULT')
//          LIMIT 10`
//       );
//       if (!rows.length) return;
//       console.log(`[StatsCron] Outside window — ${rows.length} unsynced`);
//       for (const m of rows) await syncMatchStats(m);
//       return;
//     }

//     const matches = await getMatchesToSync();
//     if (!matches.length) return;

//     console.log(`[StatsCron] Syncing ${matches.length} match(es)...`);
//     for (const m of matches) {
//       await syncMatchStats(m);
//       await sleep(400);
//     }
//   } catch (err) {
//     console.error("[StatsCron] Error:", err.message);
//   }
// };

// /* ================= JOB 4 — CLEANUP — daily 2 AM UTC ================= */
// const cleanupOldInactiveMatches = async () => {
//   console.log("🧹 [CRON] Cleanup started:", new Date().toISOString());
//   try {
//     const [result] = await db.query(
//       `DELETE FROM matches
//        WHERE is_active = 0
//          AND start_time <= DATE_SUB(NOW(), INTERVAL 30 DAY)`
//     );
//     console.log(`✅ [CRON] Cleanup done — ${result.affectedRows} matches deleted`);
//   } catch (err) {
//     console.error("❌ [CRON] Cleanup failed:", err.message);
//   }
// };



// export const startTimelineCron = () => {
//   // Every minute
//   cron.schedule("* * * * *", async () => {
//     try {
//       const now = new Date();

//       // Upcoming matches with lineup available
//       const [matches] = await db.execute(
//         `SELECT id, start_time, lineupavailable
//          FROM matches
//          WHERE status     IN ('UPCOMING', 'LIVE')
//            AND is_active   = 1
//            AND lineupavailable = 1
//            AND start_time  > ?`,
//         [now]
//       );

//       for (const match of matches) {
//         const kickoff  = new Date(match.start_time);
//         const minsLeft = Math.round((kickoff - now) / (1000 * 60));

//         let stage;
//         if      (minsLeft > 60) stage = "LINEUPS_OUT";
//         else if (minsLeft > 45) stage = "USERS_ADJUSTING";
//         else if (minsLeft > 30) stage = "CAPTAIN_ROTATIONS";
//         else if (minsLeft > 15) stage = "DEADLINE_PRESSURE";
//         else if (minsLeft > 0)  stage = "CHAOS_ZONE";
//         else                    stage = "FANTASY_LOCK";

//         await db.execute(
//           `UPDATE matches SET lineup_status = ? WHERE id = ?`,
//           [stage, match.id]
//         );
//       }

//       console.log(`✅ [TimelineCron] Updated ${matches.length} matches`);
//     } catch (err) {
//       console.error("[TimelineCron] Error:", err.message);
//     }
//   });

//   console.log("✅ [CRON] Timeline job registered");
// };

// export const startLineupStatusCron = () => {
//   // Every 5 mins
//   cron.schedule("*/5 * * * *", async () => {
//     try {
//       const now            = new Date();
//       const twoHoursLater  = new Date(now.getTime() + 2 * 60 * 60 * 1000);

//       // Only UPCOMING matches today within 2 hour window
//       const [matches] = await db.execute(
//         `SELECT id, start_time, lineupavailable
//          FROM matches
//          WHERE is_active  = 1
//            AND status     = 'UPCOMING'
//            AND DATE(start_time) = CURDATE()
//            AND start_time <= ?
//            AND start_time >  NOW()`,
//         [twoHoursLater]
//       );

//       if (!matches.length) return;

//       for (const match of matches) {
//         const kickoff  = new Date(match.start_time);
//         const minsLeft = Math.round((kickoff - now) / (1000 * 60));

//         // Only if lineup available
//         if (!match.lineupavailable) continue;

//         let stage;
//         if      (minsLeft > 60) stage = "LINEUPS_OUT";
//         else if (minsLeft > 45) stage = "USERS_ADJUSTING";
//         else if (minsLeft > 30) stage = "CAPTAIN_ROTATIONS";
//         else if (minsLeft > 15) stage = "DEADLINE_PRESSURE";
//         else if (minsLeft > 0)  stage = "CHAOS_ZONE";
//         else                    stage = "FANTASY_LOCK";

//         await db.execute(
//           `UPDATE matches SET lineup_status = ? WHERE id = ?`,
//           [stage, match.id]
//         );
//       }

//       console.log(`✅ [LineupStatusCron] ${matches.length} matches checked`);
//     } catch (err) {
//       console.error("[LineupStatusCron] Error:", err.message);
//     }
//   });

//   console.log("✅ [CRON] Lineup status job registered");
// };

// /* ================= START ALL CRON JOBS ================= */
//  export const startCronJobs = () => {

//   // Lineup sync      — every 5 mins
//   cron.schedule("*/5 * * * *", syncLineups,             { scheduled: true, timezone: "UTC" });

//   // Match status     — every 5 mins
//   cron.schedule("*/5 * * * *", syncMatchStatuses,       { scheduled: true, timezone: "UTC" });

//   // Player stats     — every 5 mins
//   cron.schedule("*/5 * * * *", syncPlayerStatsJob,      { scheduled: true, timezone: "UTC" });

//   // Cleanup          — daily 2 AM UTC
//   cron.schedule("0 2 * * *",   cleanupOldInactiveMatches, { scheduled: true, timezone: "UTC" });

//   // Timeline status  — every 1 min
//   startTimelineCron();

//     startLineupStatusCron(); 


//   console.log("✅ [CRON] All jobs registered");
// };









import cron from "node-cron";
import db   from "../../../config/db.js";
import {
  syncPlayingXIService,
  // syncAllPlayerStatsService,  // ← implement చేసిన తర్వాత uncomment చేయి
} from "./sportmonks.service.js";

/* ================= HELPERS ================= */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDateTime = (date) => date.toISOString().slice(0, 19).replace("T", " ");

const getISTHour = () => {
  const istMs = Date.now() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).getUTCHours();
};

const isLiveWindow = () => {
  const h = getISTHour();
  return h >= 14 || h <= 2;
};

/* ================= SCHEDULES ================= */
const SCHEDULES = {
  EVERY_5_MINS:  "*/5 * * * *",
  DAILY_2AM_UTC: "0 2 * * *",
};

/* ================= JOB 1 — LINEUP SYNC ================= */
const syncLineups = async () => {
  console.log("⏰ [CRON] Lineup sync started:", new Date().toISOString());
  try {
    const now             = new Date();
    const ninetyMinsLater = new Date(now.getTime() + 90 * 60 * 1000);

    const [matches] = await db.query(
      `SELECT id, provider_match_id, start_time, lineup_status, status
       FROM matches
       WHERE is_active = 1
         AND lineup_status != 'confirmed'
         AND (
           (status = 'UPCOMING' AND start_time <= ?)
           OR status = 'LIVE'
         )
       ORDER BY start_time ASC`,
      [formatDateTime(ninetyMinsLater)]
    );

    if (!matches.length) {
      console.log("✅ [CRON] No matches needing lineup sync");
      return;
    }

    console.log(`📋 [CRON] Lineup check for ${matches.length} match(es)`);

    for (const match of matches) {
      try {
        const result = await syncPlayingXIService(match.provider_match_id);
        if (result.reason) {
          console.log(`⏳ [CRON] Match ${match.provider_match_id} — ${result.reason}`);
        } else {
          console.log(`✅ [CRON] Match ${match.provider_match_id} — ${result.count} players confirmed`);
        }
        await sleep(1000);
      } catch (err) {
        console.error(`❌ [CRON] Lineup failed for ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ [CRON] syncLineups failed:", err.message);
  }
};

/* ================= JOB 2 — MATCH STATUS ================= */
const syncMatchStatuses = async () => {
  console.log("⏰ [CRON] Status sync started:", new Date().toISOString());
  try {
    const [toLive] = await db.query(
      `UPDATE matches SET status = 'LIVE'
       WHERE is_active = 1
         AND status = 'UPCOMING'
         AND start_time <= NOW()`
    );

    const [toResult] = await db.query(
      `UPDATE matches SET status = 'RESULT'
       WHERE is_active = 1
         AND status IN ('UPCOMING', 'LIVE')
         AND start_time <= DATE_SUB(NOW(), INTERVAL 150 MINUTE)`
    );

    console.log(`✅ [CRON] UPCOMING→LIVE: ${toLive.affectedRows} | LIVE→RESULT: ${toResult.affectedRows}`);
  } catch (err) {
    console.error("❌ [CRON] syncMatchStatuses failed:", err.message);
  }
};

/* ================= JOB 3 — PLAYER STATS ================= */
const syncPlayerStatsJob = async () => {
  try {
    if (!isLiveWindow()) {
      // Outside live window — skip
      return;
    }

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace("T", " ");

    const [matches] = await db.query(
      `SELECT id, provider_match_id, status, start_time
       FROM matches
       WHERE status IN ('LIVE', 'live', 'inplay')
       ORDER BY start_time ASC`
    );

    if (!matches.length) return;

    console.log(`[StatsCron] Syncing ${matches.length} match(es)...`);

    for (const m of matches) {
      try {
        // TODO: implement syncAllPlayerStatsService
        // await syncAllPlayerStatsService(m.id);
        console.log(`[StatsCron] Match ${m.id} — stats sync skipped (not implemented)`);
      } catch (err) {
        console.error(`[StatsCron] Match ${m.id} error:`, err.message);
      }
      await sleep(400);
    }
  } catch (err) {
    console.error("[StatsCron] Error:", err.message);
  }
};

/* ================= JOB 4 — CLEANUP ================= */
const cleanupOldInactiveMatches = async () => {
  console.log("🧹 [CRON] Cleanup started:", new Date().toISOString());
  try {
    const [result] = await db.query(
      `DELETE FROM matches
       WHERE is_active = 0
         AND start_time <= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    console.log(`✅ [CRON] Cleanup done — ${result.affectedRows} matches deleted`);
  } catch (err) {
    console.error("❌ [CRON] Cleanup failed:", err.message);
  }
};

/* ================= JOB 5 — LINEUP STATUS ================= */
const syncLineupStatus = async () => {
  try {
    const now           = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const [matches] = await db.execute(
      `SELECT id, start_time, lineupavailable
       FROM matches
       WHERE is_active        = 1
         AND status           = 'UPCOMING'
         AND DATE(start_time) = CURDATE()
         AND start_time      <= ?
         AND start_time      >  NOW()`,
      [twoHoursLater]
    );

    if (!matches.length) return;

    for (const match of matches) {
      if (!match.lineupavailable) continue;

      const minsLeft = Math.round((new Date(match.start_time) - now) / (1000 * 60));

      let stage;
      if      (minsLeft > 60) stage = "LINEUPS_OUT";
      else if (minsLeft > 45) stage = "USERS_ADJUSTING";
      else if (minsLeft > 30) stage = "CAPTAIN_ROTATIONS";
      else if (minsLeft > 15) stage = "DEADLINE_PRESSURE";
      else if (minsLeft > 0)  stage = "CHAOS_ZONE";
      else                    stage = "FANTASY_LOCK";

      await db.execute(
        `UPDATE matches SET lineup_status = ? WHERE id = ?`,
        [stage, match.id]
      );
    }

    console.log(`✅ [LineupStatusCron] ${matches.length} matches checked`);
  } catch (err) {
    console.error("[LineupStatusCron] Error:", err.message);
  }
};

/* ================= START ALL CRON JOBS ================= */
export const startCronJobs = () => {
  cron.schedule(SCHEDULES.EVERY_5_MINS,  syncLineups,               { scheduled: true, timezone: "UTC" });
  cron.schedule(SCHEDULES.EVERY_5_MINS,  syncMatchStatuses,         { scheduled: true, timezone: "UTC" });
  cron.schedule(SCHEDULES.EVERY_5_MINS,  syncPlayerStatsJob,        { scheduled: true, timezone: "UTC" });
  cron.schedule(SCHEDULES.EVERY_5_MINS,  syncLineupStatus,          { scheduled: true, timezone: "UTC" });
  cron.schedule(SCHEDULES.DAILY_2AM_UTC, cleanupOldInactiveMatches, { scheduled: true, timezone: "UTC" });

  console.log("✅ [CRON] All jobs registered");
}; 