import db from "../config/db.js";

/* ═══════════════════════════════════════════════════
   TABLE: admin_activity_logs
   id, admin_id, admin_name, admin_role, category, action,
   details, created_at

   categories: packs | finance | payments | catalog | users | admin
   admin_role: examples — "Super Admin", "Finance", "Operations"
   ═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   HELPER — logAdminActivity
   Call this from inside other controllers right after a
   create/edit/delete/refund/credential-change action succeeds.

   Usage example (inside another controller):
     import { logAdminActivity } from "../utils/activityLogger.js";
     await logAdminActivity({
       adminId:   req.admin.id,
       adminName: req.admin.email,
       adminRole: req.admin.role,
       category:  "packs",
       action:    "Coin pack updated",
       details:   "Pro price changed $240 → $250",
     });
   ═══════════════════════════════════════════════════ */
export const logAdminActivity = async ({
  adminId,
  adminName,
  adminRole,
  category,
  action,
  details,
}) => {
  try {
    await db.execute(
      `INSERT INTO admin_activity_logs
        (admin_id, admin_name, admin_role, category, action, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [adminId, adminName, adminRole, category, action, details || null]
    );
  } catch (err) {
    /* Logging failure should never break the parent action */
    console.error("Failed to log admin activity:", err.message);
  }
};