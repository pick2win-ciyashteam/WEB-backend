import { Router } from "express";
import { adminLimiter, adminAuth } from "../../../middlewares/adminAuth.middleware.js";
import { authenticate } from "../../../middlewares/auth.middleware.js";
import {
  getAllFeedbacks, 
  updateFeedbackPost, deleteFeedbackPost,
  createFeedbackPost, submitFeedback,
   getFeedbackPosts,
  getAdminFeedbackPosts,
  createQuestion,
  getAdminQuestions,
  updateQuestion,
  deleteQuestion,
  getAdminAnswers,
  getUserQuestions,
  submitAnswers,
} from "./feedback.controller.js";   

const router = Router();

// ── USER only (user token required) ──────────────────────────
router.post("/user-post",   authenticate,  submitFeedback);
router.get("/feedback-get", authenticate,  getFeedbackPosts);

   
// ── ADMIN only (admin token required) ────────────────────────
router.get   ("/user-feedbacks",      adminLimiter, adminAuth(["super_admin", "admin"]), getAllFeedbacks);
router.post  ("/feedback-post",       adminLimiter, adminAuth(["super_admin", "admin"]), createFeedbackPost);
router.get("/feedback-post", adminLimiter, adminAuth(["super_admin", "admin"]), getAdminFeedbackPosts);
router.patch ("/feedback-post/:id",   adminLimiter, adminAuth(["super_admin", "admin"]), updateFeedbackPost);
router.delete("/feedback-post/:id",   adminLimiter, adminAuth(["super_admin", "admin"]), deleteFeedbackPost);

// uct questions

router.post  ("/question",     adminLimiter, adminAuth(["super_admin", "admin"]), createQuestion);
router.get   ("/question",     adminLimiter, adminAuth(["super_admin", "admin"]), getAdminQuestions);
router.patch ("/question/:id", adminLimiter, adminAuth(["super_admin", "admin"]), updateQuestion);
router.delete("/question/:id", adminLimiter, adminAuth(["super_admin", "admin"]), deleteQuestion);
router.get   ("/answers",      adminLimiter, adminAuth(["super_admin", "admin"]), getAdminAnswers);

// ── USER ───────────────────────────────────────────────────────
router.get ("/user-questions", authenticate, getUserQuestions);
router.post("/user-answers",   authenticate, submitAnswers);

export default router;