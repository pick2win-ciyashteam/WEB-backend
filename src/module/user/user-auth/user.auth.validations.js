import Joi from "joi";

/* ── Signup — only email + password are required here; fullname, country
   and mobile are filled in later through PATCH /update (that flow gates
   all three behind a single mobile-OTP verification). ── */
export const signup = (req, res, next) => {
  const { error } = Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().min(6).max(100).pattern(/^\S+$/).message("password must not contain spaces").required(),
    fullname: Joi.string().min(3).max(100).allow(null, "").optional(),
    mobile:   Joi.string().pattern(/^[0-9]{5,15}$/).allow(null, "").optional(),
    country:  Joi.string().min(2).max(100).allow(null, "").optional(),
    timezone: Joi.string().max(64).allow(null, "").optional(),
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

/* ── Update Profile — all three are required together: they're staged as
   pending_* values and only committed once the mobile OTP is verified
   via /verify-profile-update, so a half-filled profile can't be saved. ── */
export const updateProfile = (req, res, next) => {
  const { error } = Joi.object({
    fullname: Joi.string().min(3).max(100).required(),
    country:  Joi.string().min(2).max(100).required(),
    mobile:   Joi.string().pattern(/^[0-9]{5,15}$/).required(),
  }).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};   

  

/* ── Verify Profile Update (step 2 — confirm OTP) ── */
export const verifyProfileUpdate = (req, res, next) => {
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

                  