import { Router }                  from "express";
import { adminLimiter, adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import * as c                      from "./banners.controller.js";
import * as v                      from "./banners.validation.js";

const router = Router();

router.post  ("/",           adminLimiter, adminAuth(["super_admin"]), v.addBanner,    c.addBanner);
router.get   ("/",           adminLimiter, adminAuth(["super_admin"]),                 c.getAllBanners);
router.patch ("/:id",        adminLimiter, adminAuth(["super_admin"]), v.updateBanner, c.updateBanner);
router.delete("/:id",        adminLimiter, adminAuth(["super_admin"]),                 c.deleteBanner);
router.patch ("/:id/toggle", adminLimiter, adminAuth(["super_admin"]),                 c.toggleBanner);

export default router;