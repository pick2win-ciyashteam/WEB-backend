import { Router } from "express";
import { adminAuth, adminLimiter } from "../../../middlewares/adminAuth.middleware.js"
import * as v from "./admin.auth.validation.js";
import * as c from  "./admin.auth.controller.js"

const router = Router();

/* ── Auth ── */
router.post("/login",                adminLimiter, v.adminLogin,   c.adminLogin);
/* ── Employee Management ── */
router.post("/create-admin",       adminLimiter, adminAuth(["super_admin"]), v.createAdmin,  c.createAdmin);
router.get("/profile",             adminLimiter, adminAuth(["super_admin"]), c.getProfile);
router.get("/get-admins",           adminLimiter, adminAuth(["super_admin"]),                 c.getAdmins);
router.get("/get-admin-by-id/:id",   adminLimiter, adminAuth(["super_admin"]),                 c.getAdminById);
router.patch("/update-admin/:id",    adminLimiter, adminAuth(["super_admin"]), v.updateAdmin,  c.updateAdmin);

router.patch("/update-credentials", adminLimiter, adminAuth(["super_admin"]), v.updateCredentials, c.updateCredentials);
router.patch("/update-profile",     adminLimiter, adminAuth(["super_admin"]), v.updateProfile,     c.updateProfile);
router.post("/toggle-2fa",        adminLimiter, adminAuth(["super_admin"]), v.toggle2FA, c.toggle2FA);
router.delete("/remove-admin/:id", adminLimiter, adminAuth(["super_admin"]), c.removeAdmin);
router.get("/export-admins-csv",  adminLimiter, adminAuth(["super_admin"]), c.exportAdminsCSV);

  
 const ALL_ROLES = ["super_admin", "finance", "operations", "support", "catalog", "marketing"];

/* ── 2FA: super_admin generates a sub-admin's secret via /setup-2fa
   (passing admin_id) and relays it to them out-of-band to add to their
   authenticator app. super_admin then flips /toggle-2fa to require it. ── */
router.post("/setup-2fa",  adminLimiter, adminAuth(ALL_ROLES), v.setup2FA,  c.setup2FA);
router.post("/logout",     adminLimiter, adminAuth(ALL_ROLES), c.logout);


      
export default router;    

        