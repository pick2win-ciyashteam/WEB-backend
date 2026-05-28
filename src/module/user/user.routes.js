import { Router }       from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import userAuthRoutes       from "./user-auth/user.auth.routes.js"
import seriesRoutes     from "./series/series.route.js"

const router = Router();

router.use("/user-auth",   userAuthRoutes);
router.use("/series", authenticate, seriesRoutes);

export default router;