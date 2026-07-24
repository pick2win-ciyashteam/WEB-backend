import Joi from "joi";

/* ── Signup ── */
export const signup = (req, res, next) => {
  const { error } = Joi.object({
    fullname:      Joi.string().min(3).max(100).allow(null, "").optional(),
    email:         Joi.string().email().required(),
    mobile:        Joi.string().pattern(/^[0-9]{5,15}$/).allow(null, "").optional(),
    country:       Joi.string().min(2).max(100).allow(null, "").optional(),
    timezone:      Joi.string().max(64).allow(null, "").optional(),
    date_of_birth: Joi.date().less("now").allow(null, "").optional(),
    password:      Joi.string().min(6).max(100).pattern(/^\S+$/).message("password must not contain spaces").required(),
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

/* ── Update Profile ── */
export const updateProfile = (req, res, next) => {
  const { error } = Joi.object({
    fullname:      Joi.string().min(3).max(100),
    country:       Joi.string().min(2).max(100),
    timezone:      Joi.string().max(64),
    date_of_birth: Joi.date().less("now"),
  }).min(1).validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};   

  

/* ── Change Mobile ── */
export const requestMobileChange = (req, res, next) => {
  const { error } = Joi.object({
    new_mobile: Joi.string().pattern(/^[0-9]{5,15}$/).required(),
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

/* ── Verify Mobile OTP (profile — verify own mobile) ── */
export const verifyMobileOtp = (req, res, next) => {
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

                  