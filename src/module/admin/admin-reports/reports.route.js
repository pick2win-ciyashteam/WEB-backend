import express from "express";
import {
   
  
  getDashboardReport,
  getUsersList,
  getCoinExpiry,
  getCountriesReport,
  getUctOverview,
  getMatchDrilldown,
  getUctActivityList,
  getVotesSummary,
  getVotesList,
  getCoinPacksReport,
  getLeagues,
  addLeague,
  editLeague,
  toggleLeagueVisibility,
  deleteLeague
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

router.get("/votes-summary",  getVotesSummary);
 
/* Recent feedback table — filterable by vote, paginated */

router.get( "/votes-list",   getVotesList);

//COIN PACKS

router.get("/coin-packs", getCoinPacksReport);

//🏆 LEAGUES / SERIES

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

     