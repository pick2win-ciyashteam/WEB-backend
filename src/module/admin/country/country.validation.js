import Joi from "joi";

export const addCountry = (req, res, next) => {
  const schema = Joi.object({
    name:      Joi.string().min(2).max(100).required(),
    code:      Joi.string().min(2).max(10).required(),   // IN, US
    dial_code: Joi.string().min(2).max(10).required(),   // +91, +1
    flag:      Joi.string().max(10).allow("", null),
    is_active: Joi.number().valid(0, 1).default(1),
  });

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

export const updateCountry = (req, res, next) => {
  const schema = Joi.object({
    name:      Joi.string().min(2).max(100),
    code:      Joi.string().min(2).max(10),
    dial_code: Joi.string().min(2).max(10),
    flag:      Joi.string().max(10).allow("", null),
    is_active: Joi.number().valid(0, 1),
  }).min(1);

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};