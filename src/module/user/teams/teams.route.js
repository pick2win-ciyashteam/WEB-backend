import express from "express";
import { generateTeams, getMyTeams } from "./teams.controller.js";



const router = express.Router();

router.post("/generateTeams",         generateTeams);
router.get("/user-my-teams/:matchId",  getMyTeams);

export default router;