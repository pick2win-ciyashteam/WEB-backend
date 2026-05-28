import {
  signupService,
  verifyMobileOtpService,
  verifyEmailOtpService,
  resendOtpService,
  loginService,
  logoutService,
} from "./user.auth.services.js"

import {
  signupSchema,
  verifyMobileOtpSchema,
  verifyEmailOtpSchema,
  resendOtpSchema,
  loginSchema,
} from  "./user.auth.validations.js"

import { authenticate } from "../../../middlewares/auth.middleware.js";

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

/* ================= VERIFY MOBILE OTP ================= */
export const verifyMobileOtp = async (req, res) => {
  try {
    await verifyMobileOtpSchema.validateAsync(req.body);
    const result = await verifyMobileOtpService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= VERIFY EMAIL OTP ================= */
export const verifyEmailOtp = async (req, res) => {
  try {
    await verifyEmailOtpSchema.validateAsync(req.body);
    const result = await verifyEmailOtpService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= RESEND OTP ================= */
export const resendOtp = async (req, res) => {
  try {
    await resendOtpSchema.validateAsync(req.body);
    const result = await resendOtpService(req.body);
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