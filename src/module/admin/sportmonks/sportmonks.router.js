import express from "express";
import {
  getAvailableSeries,
  toggleSeries,
  getActiveSeries,
  getAvailableMatches,
  toggleMatches,
  getMatches,
  manualSyncPlayingXI,
  getFixturesByDateRange,
  getSeriesByDateRange,
  getMatchesByDateRange,
} from "./sportmonks.controller.js";

const router = express.Router();

/* ══════════════════════════════════════════
   SERIES
══════════════════════════════════════════ */
router.get("/series/available",            getAvailableSeries);
router.post("/series/toggle",              toggleSeries);
router.get("/series/active",               getActiveSeries);
router.post("/series/by-date-range",       getSeriesByDateRange);
  
/* ══════════════════════════════════════════
   MATCHES
══════════════════════════════════════════ */
router.get("/matches/available/:seriesid", getAvailableMatches);
router.post("/matches/toggle",             toggleMatches);
router.get("/matches/:seriesid",           getMatches);

/* ══════════════════════════════════════════
   SYNC
══════════════════════════════════════════ */
router.get("/sync-playingxi/:match_id", manualSyncPlayingXI);

  
router.post("/fixtures", getFixturesByDateRange);

/* Fixtures between dates, filtered to those with a published Starting XI */
router.post("/fixtures/lineups-ready", getMatchesByDateRange);





export default router;     