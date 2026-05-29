import {Router} from "express";
import {getMatchTimeline} from "./lineup.controller.js";
const router = Router();

router.get("/timeline/:matchId", getMatchTimeline);

export default router;