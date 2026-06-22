import express from "express";
import {

  getDashboardReport,
  getUsersList,
  getCoinExpiry,
  getCountriesReport,
  getUctOverview,
  getMatchDrilldown,
  getUctActivityList,
  getCoinPackPurchases,
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
  getAdminSeries,
  getCoinPackPurchasesByCountry,
  updateUserAccountStatus,
  getActivityLog,
  getRevenue,
  getExpensesByMonth,
  getExpensesFyReport,
  addExpenseCategory,
  deleteExpenseCategory,
  addExpenseRole,
  deleteExpenseRole,
  upsertExpenseEntry,
  getFyProfit,
  getProfitStatement
} from "../admin-reports/reports.controller.js";

const router = express.Router();


//DASHBOARD REPORTS

router.get("/dashboard", getDashboardReport);

/* Users table — search, filter by status/country, pagination, KPI cards */
router.get("/users", getUsersList);

 
/* Suspend / activate a user account */
router.patch("/users/:id/account-status", updateUserAccountStatus);

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

// GET /admin/coin-packs/purchases?period=today|monthly|yearly&month=6&year=2026
router.get("/coin-packs", getCoinPackPurchases);

// GET /admin/coin-packs/by-country?country=&period=monthly&month=6&year=2026
router.get("/countrywise-coin",getCoinPackPurchasesByCountry)

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

/* GET /admin/activity-log?category=all|packs|finance|payments|catalog|users|admin */

router.get("/activity-log", getActivityLog);

//REVENUE

// revenue?tab=today" 
// revenue?tab=by_month&month=7&year=2026
// revenue?tab=fy_report&year=2026

router.get("/revenue", getRevenue);


/* GET by month */
router.get("/by-month",   getExpensesByMonth);
 
/* GET FY report */
router.get("/fy-report",  getExpensesFyReport);
 
/* Category CRUD */
router.post  ("/category",     addExpenseCategory);
router.delete("/category/:id", deleteExpenseCategory);
 
/* Role CRUD (under a category) */
router.post  ("/category/:id/role", addExpenseRole);
router.delete("/role/:id",           deleteExpenseRole);
 
/* Upsert monthly amount entry */
router.patch("/entry", upsertExpenseEntry);


// PROFIT

/* FY month-by-month profit table + KPI cards */
router.get("/profit/fy", getFyProfit);
 
/* Selected month profit statement + where revenue goes */
router.get("/profit/statement", getProfitStatement);

export default router;

 