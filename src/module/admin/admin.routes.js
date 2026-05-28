import { Router } from "express";
import { authenticate }      from "../../middlewares/adminAuth.middleware.js";
import adminAuthRoutes       from "./admin-auth/adminAuth.controller.js";
import sportmonksRoutes      from "./sportmonks/sportmonks.controller.js";

const router = Router();


router.use("/sportmonks", authenticate, sportmonksRoutes);

export default router;