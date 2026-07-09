import express from "express";
import { generateTeams, getMyGeneratedMatches, getMyGeneratedTeams, getMyTeams, getTeamPlayers } from "./teams.controller.js";



const router = express.Router();


router.post("/generate-teams", generateTeams);     


router.get("/generate-matches", getMyGeneratedMatches);

// router.get("/user-my-teams/:matchId/:game", getMyTeams);

router.get("/user-my-teams/:matchId/:sport/:game", getMyTeams);

router.get ("/team-players/:teamId",     getTeamPlayers);

export default router;   
