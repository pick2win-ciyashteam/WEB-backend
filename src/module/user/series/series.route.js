
import express from "express";

import { getAllSeries, getSeriesById, getVisibleLeagues } from "./series.controller.js";
import { authenticate, optionalAuthenticate } from "../../../middlewares/auth.middleware.js";

const router = express.Router();


/* User token required — returns only visible leagues */

router.get("/leagues", getVisibleLeagues);


router.get("/:seriesid", authenticate,  getSeriesById);

router.get("/", optionalAuthenticate,  getAllSeries);
  


export default router;
    
             