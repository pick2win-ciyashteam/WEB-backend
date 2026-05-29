import cron from "node-cron";
import db   from "../../../config/db.js";
import {
  syncPlayingXIService,
  
} from "./sportmonks.service.js";

/* ================= HELPERS ================= */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDateTime = (date) => {
  return date.toISOString().slice(0, 19).replace("T", " ");
};

const getISTHour = () => {
  const istMs = Date.now() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).getUTCHours();
};

const isLiveWindow = () => {
  const h = getISTHour();
  return h >= 14 || h <= 2; // IST 14:00 – 02:00
};

/* ================= JOB 1 — LINEUP SYNC — every 5 mins ================= */
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

/* ================= JOB 2 — MATCH STATUS — every 5 mins ================= */
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

    console.log(
      `✅ [CRON] UPCOMING→LIVE: ${toLive.affectedRows} | LIVE→RESULT: ${toResult.affectedRows}`
    );
  } catch (err) {
    console.error("❌ [CRON] syncMatchStatuses failed:", err.message);
  }
};

/* ================= JOB 3 — PLAYER STATS — every 5 mins ================= */
const getMatchesToSync = async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const [rows] = await db.query(
    `SELECT id, provider_match_id, status, start_time
     FROM matches
     WHERE
       status IN ('live', 'inplay', 'LIVE')
       OR (
         status IN ('finished', 'completed', 'RESULT')
         AND stats_final_synced = 0
         AND start_time >= ?
       )
     ORDER BY start_time ASC`,
    [twoHoursAgo]
  );
  return rows;
};

const markFinalSynced = async (matchId) => {
  await db.query(
    `UPDATE matches SET stats_final_synced = 1 WHERE id = ?`,
    [matchId]
  );
};

const syncMatchStats = async (match) => {
  try {
    const result = await syncAllPlayerStatsService(match.id);

    if (result.reason) {
      console.log(`  [SKIP] Match ${match.id}: ${result.reason}`);
      return;
    }

    console.log(
      `  [OK]   Match ${match.id} — ${result.count} saved, ${result.skipped?.length || 0} skipped`
    );

    const finishedStatuses = ["finished", "completed", "result"];
    if (finishedStatuses.includes(match.status?.toLowerCase())) {
      await markFinalSynced(match.id);
      console.log(`  [DONE] Match ${match.id} marked final-synced`);
    }
  } catch (err) {
    console.error(`  [ERR]  Match ${match.id}: ${err.message}`);
  }
};

const syncPlayerStatsJob = async () => {
  try {
    if (!isLiveWindow()) {
      /* ── Outside live window — only unsynced finished matches ── */
      const [rows] = await db.query(
        `SELECT id, provider_match_id, status
         FROM matches
         WHERE stats_final_synced = 0
           AND status IN ('finished', 'completed', 'RESULT')
         LIMIT 10`
      );
      if (!rows.length) return;
      console.log(`[StatsCron] Outside window — ${rows.length} unsynced`);
      for (const m of rows) await syncMatchStats(m);
      return;
    }

    const matches = await getMatchesToSync();
    if (!matches.length) return;

    console.log(`[StatsCron] Syncing ${matches.length} match(es)...`);
    for (const m of matches) {
      await syncMatchStats(m);
      await sleep(400);
    }
  } catch (err) {
    console.error("[StatsCron] Error:", err.message);
  }
};

/* ================= JOB 4 — CLEANUP — daily 2 AM UTC ================= */
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

/* ================= START ALL CRON JOBS ================= */
export const startCronJobs = () => {

  // Lineup sync      — every 5 mins
  cron.schedule("*/5 * * * *", syncLineups,             { scheduled: true, timezone: "UTC" });

  // Match status     — every 5 mins
  cron.schedule("*/5 * * * *", syncMatchStatuses,       { scheduled: true, timezone: "UTC" });

  // Player stats     — every 5 mins
  cron.schedule("*/5 * * * *", syncPlayerStatsJob,      { scheduled: true, timezone: "UTC" });

  // Cleanup          — daily 2 AM UTC
  cron.schedule("0 2 * * *",   cleanupOldInactiveMatches, { scheduled: true, timezone: "UTC" });

  console.log("✅ [CRON] All jobs registered");
};