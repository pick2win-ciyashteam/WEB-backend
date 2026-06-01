import express from "express";
import {
    getActivityDormancyReport,
    getDashboardReport,
    getDirectoryReport,
    getGeographyReport,
    getLeagueMatches,
    getLiveMatches,
    getPackBuyersReport,
    getPastMatches,
    getUpcomingMatches
} from "./admin.reports.controller.js";


const router = express.Router();

router.get("/overview", getDashboardReport);

router.get("/geography", getGeographyReport);

router.get("/pack-buyers", getPackBuyersReport);

router.get("/activity-dormancy", getActivityDormancyReport);

router.get("/directory", getDirectoryReport);

router.get("/matches/live", getLiveMatches);

router.get("/matches/upcoming", getUpcomingMatches);

router.get("/matches/past", getPastMatches);

router.get("/matches/league", getLeagueMatches);

export default router;