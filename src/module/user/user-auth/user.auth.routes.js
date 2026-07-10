import { Router }       from "express";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import * as v           from "./user.auth.validations.js";
import * as c           from "./user.auth.controllers.js";

const router = Router();

/* ── Public routes ── */
router.post("/signup",            v.signup,          c.signup);
router.post("/verify-mobile-otp", v.verifyMobileOtp, c.verifyMobileOtp);
router.post("/verify-email-otp",  v.verifyEmailOtp,  c.verifyEmailOtp);   
router.post("/resend-otp",        v.resendOtp,       c.resendOtp);
router.post("/login",             v.login,           c.login);

/* ── Protected routes ── */
router.post  ("/logout",  authenticate,              c.logout);   
router.get   ("/profile", authenticate,              c.getProfile);
router.patch ("/update",  authenticate, v.updateProfile, c.updateProfile);
// router.delete("/delete",  authenticate,              c.deleteAccount);

router.post("/delete-account",         authenticate, c.deleteAccount);
router.post("/confirm-delete-account", authenticate, c.confirmDeleteAccount);

// GET http://localhost:3000/api/user/user-auth/activity-logs
// GET http://localhost:3000/api/user/user-auth/activity-logs?from_date=2026-07-01&to_date=2026-07-09
// GET http://localhost:3000/api/user/user-auth/activity-logs?category=auth&date=2026-07-09

router.get("/activity-logs", authenticate, c.getMyActivityLogs);




/* ── Forgot Password — public ── */
router.post("/forgot-password",  v.forgotPassword,  c.forgotPassword);
router.post("/reset-password",   v.resetPassword,   c.resetPassword);

/* ── Change Mobile/Email — protected ── */
router.post("/change-mobile",        authenticate, v.requestMobileChange, c.requestMobileChange);
router.post("/verify-mobile-change", authenticate, v.verifyChangeOtp,     c.verifyMobileChange);
router.post("/change-email",         authenticate, v.requestEmailChange,  c.requestEmailChange);
router.post("/verify-email-change",  authenticate, v.verifyChangeOtp,     c.verifyEmailChange);

//notifications

router.post("/register-device", authenticate, c.registerDevice);
router.get("/get-notification",                    authenticate, c.getMyNotifications);
router.patch("/notification/read/:id",          authenticate, c.markAsRead);
router.delete("/notification/:id",              authenticate, c.deleteNotification);
  
 
export default router;  
     
