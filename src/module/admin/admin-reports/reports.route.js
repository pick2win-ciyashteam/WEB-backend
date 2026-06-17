import express from "express";
import {
  getDashboardOverview,
  getDashboardLive,
  getUsersManagement,
  getCoinExpiryReminders,
  getDashboardReport,
  getUsersList,
  getCoinExpiry,
  getCountriesReport
} from "../admin-reports/reports.controller.js";

const router = express.Router();


//dashboard

router.get("/dashboard", getDashboardReport);

/* Users table — search, filter by status/country, pagination, KPI cards */
router.get("/users", getUsersList);
 
/* Coin expiry & reminders — window: 30d | 15d | expired */
router.get("/coin-expiry", getCoinExpiry);
 
router.get("/countries", getCountriesReport);






















router.get("/overview", getDashboardOverview);

router.get("/live", getDashboardLive);

router.get("/users", getUsersManagement);

router.get("/coin-expiry-reminders", getCoinExpiryReminders);

export default router;      

     