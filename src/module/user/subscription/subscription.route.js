import { Router } from "express";
import { getActivePlans } from "./subscription.controller.js";

const router = Router();

router.get("/", getActivePlans);   

export default router;