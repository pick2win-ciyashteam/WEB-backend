import { Router }       from "express";
import rateLimit        from "express-rate-limit";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import * as v           from "./user.auth.validations.js";
import * as c           from "./user.auth.controllers.js";

const router = Router();

/* 20 requests / 15 min / IP on sensitive public auth endpoints (brute-force / OTP cost abuse) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again later." },
});

/* ── Public routes ── */
router.post("/signup",            authLimiter, v.signup,          c.signup);
router.post("/verify-email-otp",  authLimiter, v.verifyEmailOtp,  c.verifyEmailOtp);
router.post("/resend-otp",        authLimiter, v.resendOtp,       c.resendOtp);
router.post("/login",             authLimiter, v.login,           c.login);
router.post("/restore-account",   authLimiter, v.restoreAccount,  c.restoreAccount);
router.post("/decline-restore",   authLimiter, v.restoreAccount,  c.declineRestore);

/* ── Protected routes ── */
router.post  ("/logout",             authenticate,   c.logout);
router.post  ("/logout-all-devices", authenticate,   c.logoutAllDevices);
router.get   ("/profile", authenticate,              c.getProfile);
router.patch ("/update",  authenticate, v.updateProfile, c.updateProfile);

router.post("/delete-account",         authenticate, c.deleteAccount);
router.post("/confirm-delete-account", authenticate, c.confirmDeleteAccount);

// GET http://localhost:3000/api/user/user-auth/activity-logs
// GET http://localhost:3000/api/user/user-auth/activity-logs?from_date=2026-07-01&to_date=2026-07-09
// GET http://localhost:3000/api/user/user-auth/activity-logs?category=auth&date=2026-07-09

router.get("/activity-logs", authenticate, c.getMyActivityLogs);


/* ── Forgot Password — public ── */
router.post("/forgot-password",  authLimiter, v.forgotPassword,  c.forgotPassword);
router.post("/reset-password",   authLimiter, v.resetPassword,   c.resetPassword);

/* ── Profile update step 2 — PATCH /update stages fullname/country/mobile
   and sends an OTP (Twilio Verify) to the new number; this confirms that
   OTP and commits all three staged fields at once. ── */
router.post("/verify-profile-update", authenticate, v.verifyProfileUpdate, c.verifyProfileUpdate);

/* ── Change Email — protected ── */
router.post("/change-email",         authenticate, v.requestEmailChange,  c.requestEmailChange);
router.post("/verify-old-email-otp", authenticate, v.verifyOldEmailOtp,   c.verifyOldEmailChange);
router.post("/verify-email-change",  authenticate, v.verifyChangeOtp,     c.verifyEmailChange);

//notifications

router.post("/register-device", authenticate, c.registerDevice);
router.get("/get-notification",                    authenticate, c.getMyNotifications);
router.patch("/notification/read/:id",          authenticate, c.markAsRead);
router.delete("/notification/delete-all",       authenticate, c.deleteAllNotifications);
router.delete("/notification/:id",              authenticate, c.deleteNotification);
  
 
export default router;     
                                                
