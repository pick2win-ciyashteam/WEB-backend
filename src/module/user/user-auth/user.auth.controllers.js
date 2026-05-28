import jwt from "jsonwebtoken";
import {
  signupService,
  verifySignupOtpService,
  verifyEmailService,
  loginService,
  logoutService,
} from "./user.auth.services.js";

import {
  signupSchema,
  verifySignupOtpSchema,
  loginSchema,
  verifyEmailSchema,
} from  "../user-auth/user.auth.validations.js"

/* ================= SIGNUP ================= */
export const signup = async (req, res) => {
  try {
    await signupSchema.validateAsync(req.body);
    const result = await signupService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= VERIFY SIGNUP OTP ================= */
export const verifySignupOtp = async (req, res) => {
  try {
    await verifySignupOtpSchema.validateAsync(req.body);
    const result = await verifySignupOtpService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= VERIFY EMAIL LINK ================= */
export const verifyEmailLink = async (req, res) => {
  try {
    await verifyEmailSchema.validateAsync(req.query);
    const result = await verifyEmailService(req.query.token);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= LOGIN ================= */
export const login = async (req, res) => {
  try {
    await loginSchema.validateAsync(req.body);
    const result = await loginService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= LOGOUT ================= */
export const logout = async (req, res) => {
  try {
    const result = await logoutService(req.user.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};