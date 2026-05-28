import { Router } from "express";
import { authenticate }    from "../../../middlewares/auth.middleware.js";
import {
  signup,
  verifySignupOtp,
  verifyEmailLink,
  login,
  logout,
} from "./user.auth.controllers.js";

const router = Router();

router.post("/signup",         signup);
router.post("/verify-signup",  verifySignupOtp);
router.get ("/verify-email",   verifyEmailLink);  
router.post("/login",          login);
router.post("/logout",         authenticate, logout);

export default router;