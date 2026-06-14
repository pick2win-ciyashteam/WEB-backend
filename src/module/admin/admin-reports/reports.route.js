import express from "express";
import {
  getDashboardOverview,
  getDashboardLive,
  getUsersManagement,
  getCoinExpiryReminders
} from "../admin-reports/reports.controller.js";

const router = express.Router();

router.get("/overview", getDashboardOverview);

router.get("/live", getDashboardLive);

router.get("/users", getUsersManagement);

router.get("/coin-expiry-reminders", getCoinExpiryReminders);

export default router;      

     