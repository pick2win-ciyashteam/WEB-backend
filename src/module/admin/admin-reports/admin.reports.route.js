import express from "express";
import { getActivityDormancyReport, getDashboardReport, getDirectoryReport, getGeographyReport, getPackBuyersReport } from "./admin.reports.controller.js";


const router = express.Router();

 router.get("/overview", getDashboardReport);

 router.get("/geography",  getGeographyReport);

 router.get("/pack-buyers",  getPackBuyersReport);

 router.get("/activity-dormancy",  getActivityDormancyReport);

 router.get("/directory",  getDirectoryReport);

export default router;