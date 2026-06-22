
import express from "express";

import { getAllSeries, getSeriesById, getVisibleLeagues } from "./series.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";

const router = express.Router();


/* User token required — returns only visible leagues */

router.get("/leagues", getVisibleLeagues);


router.get("/:seriesid", authenticate,  getSeriesById);

router.get("/", authenticate,  getAllSeries);  
  


export default router;
    
