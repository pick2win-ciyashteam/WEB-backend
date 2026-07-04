import { Router } from "express";
import { adminAuth, adminLimiter } from "../../../src/middlewares/adminAuth.middleware.js"
import adminAuthRoutes from "./admin-auth/admin.auth.route.js"
import sportmonksRoutes from "./sportmonks/sportmonks.router.js";
import countryRoutes from "./country/country.route.js";
import bannerRoutes from "./banners/banners.route.js";
import subscriptionRoutes from "./subscription/subscription.route.js";
import feedbackRoutes from "./feedback/feedback.route.js"
import supportAdminRoutes from "./support/admin.support.route.js"
import reportsRoutes from "./admin-reports/reports.route.js"
import notificationRoutes from "./notification/notification.route.js"

const router = Router();

router.use("/admin-auth", adminAuthRoutes);

router.use("/sportmonks", adminLimiter, adminAuth(["super_admin"]), sportmonksRoutes);

router.use("/country", countryRoutes);

router.use("/banners", adminLimiter, adminAuth(["super_admin"]), bannerRoutes);

router.use("/subscription",adminLimiter,adminAuth(["super_admin"]),subscriptionRoutes)

router.use("/feedback", feedbackRoutes) 

  
router.use("/reports", adminLimiter, adminAuth(["super_admin"]), reportsRoutes)

router.use("/support",adminLimiter, adminAuth(["super_admin"]),supportAdminRoutes)

router.use("/notification", adminLimiter, adminAuth(["super_admin"]),notificationRoutes)



export default router;       