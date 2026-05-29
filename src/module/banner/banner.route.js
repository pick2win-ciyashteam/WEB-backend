import { Router } from "express";

import { getActiveBanners } from  "./banner.controller.js";

const router = Router();

router.get("/", getActiveBanners);  


export default router;  