import Joi from "joi";

/* ── Signup ── */
export const signupSchema = Joi.object({
  fullname:      Joi.string().min(3).max(100).required(),
  email:         Joi.string().email().required(),
  mobile:        Joi.string().pattern(/^[0-9]{10,15}$/).required(),
  country:       Joi.string().min(2).max(100).required(),
  date_of_birth: Joi.date().less("now").required(),
  password:      Joi.string().min(6).max(100).required(),
});

/* ── Verify Mobile OTP ── */
export const verifySignupOtpSchema = Joi.object({
  mobile:     Joi.string().pattern(/^[0-9]{10,15}$/).required(),
  mobile_otp: Joi.string().length(6).required(),
});

/* ── Login ── */
export const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

/* ── Verify Email Link (query param) ── */
export const verifyEmailSchema = Joi.object({
  token: Joi.string().required(),
});

/* ── Request Contact Change ── */
export const requestContactChangeSchema = Joi.object({
  type: Joi.string().valid("email", "mobile").required(),
});

/* ── Verify Old Contact ── */
export const verifyOldContactSchema = Joi.object({
  otp: Joi.string().length(6).required(),
});

/* ── Verify New Contact ── */
export const verifyNewContactSchema = Joi.object({
  new_value: Joi.alternatives().conditional("..type", {
    switch: [
      { is: "email",  then: Joi.string().email().required() },
      { is: "mobile", then: Joi.string().pattern(/^[0-9]{10,15}$/).required() },
    ],
  }),
  otp: Joi.string().length(6).required(),
  type: Joi.string().valid("email", "mobile").required(),
});