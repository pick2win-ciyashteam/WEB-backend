import { Router } from "express";
import adminAuthRoutes       from "./admin-auth/admin.auth.route.js"
import sportmonksRoutes      from "./sportmonks/sportmonks.router.js";
import countryRoutes         from "./country/country.route.js";

const router = Router();

router.use("/admin-auth", adminAuthRoutes);
router.use("/sportmonks", sportmonksRoutes);
router.use("/country",   countryRoutes);

export default router;