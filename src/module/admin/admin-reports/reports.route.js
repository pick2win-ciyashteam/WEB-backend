import express from "express";
import {

  getDashboardReport,
  getUsersList,
  getCoinExpiry,
  getCountriesReport,
  getUctOverview,
  getMatchDrilldown,
  getUctActivityList,
  getCoinPacksReport,
  getLeagues,
  addLeague,
  editLeague,
  toggleLeagueVisibility,
  deleteLeague,
  getVotesSurveySummary,
  getDetailedFeedbackSummary,
  updateDetailedFeedbackStatus,
  getDetailedFeedbackList,
  getVotesSurveyList,
  getAdminSeries
} from "../admin-reports/reports.controller.js";

const router = express.Router();


//DASHBOARD REPORTS

router.get("/dashboard", getDashboardReport);

/* Users table — search, filter by status/country, pagination, KPI cards */
router.get("/users", getUsersList);

//   🌍Regions

router.get("/coin-expiry", getCoinExpiry);

router.get("/countries", getCountriesReport);


// UCT ACTIVITY REPORTS

/* KPIs + Today's matches table + Coins reconciliation */
router.get("/uct-overview", getUctOverview);

/* Selected match drill-down: region-wise users + lineouts-to-kickoff chart */
router.get("/uct-match-drilldown", getMatchDrilldown);

/* UCT activity (date-range) table + Recent generations feed (paginated) */
router.get("/uct-activity-list", getUctActivityList);


// VOTES AND FEEDBACK REPORTS


/* ── Tab 1: Votes Survey ── */
router.get("/votes-summary", getVotesSurveySummary);

router.get("/votes-list", getVotesSurveyList);

/* ── Tab 2: Detailed Feedback ── */
router.get("/detailed-summary", getDetailedFeedbackSummary);

router.get("/detailed-list", getDetailedFeedbackList);

router.patch("/detailed/:id/status", updateDetailedFeedbackStatus);

//COIN PACKS

router.get("/coin-packs", getCoinPacksReport);

//🏆 LEAGUES / SERIES

/* GET /admin/series?status=all|live|upcoming|completed */
router.get("/series", getAdminSeries);

/* List + KPIs */
router.get("/leagues", getLeagues);

/* Add new league */
router.post("/leagues", addLeague);

/* Edit league */
router.patch("/leagues/:id", editLeague);

/* Toggle shown/hidden on website */
router.patch("/leagues/:id/toggle-visibility", toggleLeagueVisibility);

/* Delete league */
router.delete("/leagues/:id", deleteLeague);


export default router;

