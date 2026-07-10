// src/module/admin/notification/notification.route.js
import { Router }    from "express";
import { adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { sendToUser, sendToAll } from "./notification.controller.js";

const router = Router();

router.post("/send-to-user",  adminAuth(["super_admin"]), sendToUser);
router.post("/send-to-all",   adminAuth(["super_admin"]), sendToAll);


export default router;    