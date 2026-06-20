import Joi from "joi";

 export const createAdmin = (req, res, next) => {
  const schema = Joi.object({
    name:         Joi.string().min(3).max(100).required(),
    email:        Joi.string().email().required(),
    mobile:       Joi.string().min(10).max(15).optional(),
    password:     Joi.string().min(8).max(100).required(),
    role:         Joi.string().valid("super_admin", "finance", "operations", "support", "catalog", "marketing").required(),
    access_level: Joi.string().valid("read_only", "editor").optional(),
  });
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

// export const updateAdmin = (req, res, next) => {
//   const schema = Joi.object({
//     role:         Joi.string().valid("super_admin", "finance", "operations", "support", "catalog", "marketing"),
//     status:       Joi.string().valid("active", "inactive"),
//     access_level: Joi.string().valid("read_only", "editor"),
//   }).min(1);
//   const { error } = schema.validate(req.body);
//   if (error) return res.status(400).json({ success: false, message: error.details[0].message });
//   next();
// };

 export const updateAdmin = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().trim(),
    email: Joi.string().email(),
    mobile: Joi.string().trim(),
    role: Joi.string().valid(
      "super_admin",
      "finance",
      "operations",
      "support",
      "catalog",
      "marketing"
    ),
    status: Joi.string().valid(
      "active",
      "inactive"
    ),
    access_level: Joi.string().valid(
      "read_only",
      "editor"
    ),
  }).min(1);

  const { error } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }

  next();
};
  
export const adminLogin = (req, res, next) => {
  const schema = Joi.object({
    email:     Joi.string().email().required(),
    password:  Joi.string().required(),
    twoFaCode: Joi.string().length(6).pattern(/^\d+$/).optional(),
  });
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

export const updateCredentials = (req, res, next) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword:     Joi.string().min(6).max(100).optional(),
    confirmPassword: Joi.string().optional(),
    new2FACode:      Joi.string().length(6).pattern(/^\d+$/).optional(),
  });
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

export const updateProfile = (req, res, next) => {
  const schema = Joi.object({
    name:   Joi.string().min(3).max(100),
    mobile: Joi.string().min(10).max(15),
  }).min(1);
  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};