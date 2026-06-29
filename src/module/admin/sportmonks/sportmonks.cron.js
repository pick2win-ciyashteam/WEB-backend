import cron from "node-cron";
import db   from "../../../config/db.js";
import {
  syncPlayingXIService,
  // syncAllPlayerStatsService,   
} from "./sportmonks.service.js";

import { cleanExpiredBlacklistTokens } from "../admin-auth/admin.auth.service.js";


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
      `SELECT m.id, m.provider_match_id, m.start_time, m.lineup_status, m.status
       FROM matches m
       INNER JOIN teams ht  ON ht.id  = m.home_team_id
       INNER JOIN teams awt ON awt.id = m.away_team_id
       WHERE m.is_active = 1
         AND m.lineup_status != 'confirmed'
         AND m.start_time <= ?
         AND m.status IN ('UPCOMING', 'LIVE', 'RESULT')
       ORDER BY m.start_time ASC`,
      [formatDateTime(ninetyMinsLater)]  // ✅ comma fix
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

 const syncSubscriptionExpiry = async () => {
  try {
    /* ── 1. Actual expiry — expiry_date     ── */
    const [result] = await db.execute(
      `UPDATE user_subscriptions
       SET status = 'expired'
       WHERE status = 'active'
         AND expiry_date < NOW()`
    );

    /* ── 2. Old packs — same user కి latest ── */
    const [oldResult] = await db.execute(
      `UPDATE user_subscriptions us
       INNER JOIN (
         SELECT user_id, MAX(id) AS latest_id
         FROM user_subscriptions
         WHERE status = 'active'
         GROUP BY user_id
       ) latest ON latest.user_id = us.user_id
       SET us.status = 'expired'
       WHERE us.status = 'active'
         AND us.id != latest.latest_id`
    );

    console.log(`✅ [SubscriptionCron] Expired: ${result.affectedRows} | Old packs: ${oldResult.affectedRows}`);
  } catch (err) {
    console.error("❌ [SubscriptionCron] Error:", err.message);
  }
};

/* ================= JOB 6 — SERIES DATES ================= */
const syncSeriesDates = async () => {
  try {
    const [result] = await db.execute(
      `UPDATE series s
       INNER JOIN (
         SELECT
           series_id,
           MIN(start_time) AS first_match,
           MAX(start_time) AS last_match
         FROM matches
         WHERE is_active = 1
         GROUP BY series_id
       ) m ON m.series_id = s.seriesid
       SET
         s.start_date = m.first_match,
         s.end_date   = m.last_match
       WHERE s.start_date IS NULL
          OR s.end_date   IS NULL`
    );

    console.log(`✅ [SeriesDatesCron] Updated ${result.affectedRows} series`);
  } catch (err) {
    console.error("❌ [SeriesDatesCron] Error:", err.message);
  }
};

 

/* ================= START ALL CRON JOBS ================= */
export const startCronJobs = () => {
  cron.schedule(SCHEDULES.EVERY_5_MINS,  syncLineups,               { scheduled: true, timezone: "UTC" });
  cron.schedule(SCHEDULES.EVERY_5_MINS,  syncMatchStatuses,         { scheduled: true, timezone: "UTC" });
  cron.schedule(SCHEDULES.EVERY_5_MINS,  syncPlayerStatsJob,        { scheduled: true, timezone: "UTC" });
  cron.schedule(SCHEDULES.EVERY_5_MINS,  syncLineupStatus,          { scheduled: true, timezone: "UTC" });
  cron.schedule(SCHEDULES.DAILY_2AM_UTC, cleanupOldInactiveMatches, { scheduled: true, timezone: "UTC" });
  cron.schedule("0 0 * * *",             syncSubscriptionExpiry,    { scheduled: true, timezone: "UTC" });
  cron.schedule("0 3 * * *",             cleanExpiredBlacklistTokens, { scheduled: true, timezone: "UTC" })
 cron.schedule(SCHEDULES.EVERY_5_MINS, syncSeriesDates, { scheduled: true, timezone: "UTC" });
  console.log("✅ [CRON] All jobs registered");
};   


