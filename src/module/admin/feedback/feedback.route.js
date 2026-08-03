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
  getUserQuestions,
  submitAnswers,
} from "./feedback.controller.js";
import { submitFeedback as validateSubmitFeedback } from "./feedback.validate.js";

const router = Router();  

//   ──────────────────────────

router.get   ("/user-feedbacks",      adminLimiter, adminAuth(["super_admin", "admin"]), getAllFeedbacks);
router.post  ("/feedback-post",       adminLimiter, adminAuth(["super_admin", "admin"]), createFeedbackPost);


// ──────── status base no post user────────────────────────────────────────────

router.post("/user-post",   authenticate,  validateSubmitFeedback, submitFeedback);
router.get("/feedback-get", authenticate,  getFeedbackPosts);
  
   
// ──────────────────────────
   

router.get("/feedback-post", adminLimiter, adminAuth(["super_admin", "admin"]), getAdminFeedbackPosts);
router.patch ("/feedback-post/:id",   adminLimiter, adminAuth(["super_admin", "admin"]), updateFeedbackPost);
router.delete("/feedback-post/:id",   adminLimiter, adminAuth(["super_admin", "admin"]), deleteFeedbackPost);


  
// uct questions

router.post  ("/question",     adminLimiter, adminAuth(["super_admin", "admin"]), createQuestion);
router.get   ("/question",     adminLimiter, adminAuth(["super_admin", "admin"]), getAdminQuestions);
router.get ("/user-question", authenticate, getUserQuestions);


router.post("/user-answers",   authenticate, submitAnswers);

router.patch ("/question/:id", adminLimiter, adminAuth(["super_admin", "admin"]), updateQuestion);
router.delete("/question/:id", adminLimiter, adminAuth(["super_admin", "admin"]), deleteQuestion);
// NOTE: admin answer viewing is served by /api/admin/reports/votes-summary and
// /votes-list (reports.controller.js), which read the uct_answers JSON blob directly.

// ── USER ───────────────────────────────────────────────────────



export default router;              
       
           