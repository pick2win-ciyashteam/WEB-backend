import Joi from "joi";

/* ── Signup ── */
export const signup = (req, res, next) => {
  const { error } = Joi.object({
    fullname: Joi.string().min(3).max(100).required(),
    email:    Joi.string().email().required(),
    mobile:   Joi.string().pattern(/^[0-9]{5,15}$/).required(),
    country:  Joi.string().min(2).max(100).required(),
    timezone: Joi.string().max(64).allow(null, "").optional(),
    password: Joi.string().min(6).max(100).pattern(/^\S+$/).message("password must not contain spaces").required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

/* ── Verify Email OTP ── */
export const verifyEmailOtp = (req, res, next) => {
  const { error } = Joi.object({
    email: Joi.string().email().required(),
    otp:   Joi.string().length(6).required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

/* ── Resend OTP (email only) ── */
export const resendOtp = (req, res, next) => {
  const { error } = Joi.object({
    email: Joi.string().email().required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

/* ── Login ── */
export const login = (req, res, next) => {
  const { error } = Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().min(6).required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};  

/* ── Restore Account (undo a pending soft-delete) ── */
export const restoreAccount = (req, res, next) => {
  const { error } = Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().min(6).required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

/* ── Update Profile (mobile triggers an OTP-based change, see
   requestMobileChangeService — same pattern as the old /change-mobile) ── */
export const updateProfile = (req, res, next) => {
  const { error } = Joi.object({
    fullname: Joi.string().min(3).max(100),
    country:  Joi.string().min(2).max(100),
    timezone: Joi.string().max(64),
    mobile:   Joi.string().pattern(/^[0-9]{5,15}$/),
  }).min(1).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};   

  

/* ── Verify Mobile Change (step 2 — confirm OTP) ── */
export const verifyMobileChange = (req, res, next) => {
  const { error } = Joi.object({
    otp: Joi.string().min(4).max(10).required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

/* ── Change Email ── */
export const requestEmailChange = (req, res, next) => {
  const { error } = Joi.object({
    new_email: Joi.string().email().required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

/* ── Verify Old Email OTP (step 1 of change-email) ── */
export const verifyOldEmailOtp = (req, res, next) => {
  const { error } = Joi.object({
    otp: Joi.string().length(6).required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

/* ── Verify Change OTP ── */
export const verifyChangeOtp = (req, res, next) => {
  const { error } = Joi.object({
    otp: Joi.string().length(6).required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

/* ── Forgot Password ── */
export const forgotPassword = (req, res, next) => {
  const { error } = Joi.object({
    email: Joi.string().email().required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

/* ── Reset Password ── */
export const resetPassword = (req, res, next) => {
  const { error } = Joi.object({
    email:    Joi.string().email().required(),
    otp:      Joi.string().length(6).required(),
    password: Joi.string().min(6).max(100).pattern(/^\S+$/).message("password must not contain spaces").required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};     

                  