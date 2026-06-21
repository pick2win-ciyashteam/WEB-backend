import { Router } from "express";
import { getActivePlans,  getMySubscription } from "./subscription.controller.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";

const router = Router();


// admin get plans list
router.get("/", getActivePlans); 

router.get("/my-subscription", authenticate, getMySubscription);

export default router;   