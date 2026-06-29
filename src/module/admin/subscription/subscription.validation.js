import Joi from "joi";

export const addPlan = (req, res, next) => {
  const schema = Joi.object({
    name:          Joi.string().min(2).max(100).required(),
    subtitle:      Joi.string().max(100).allow("", null),
    coins:         Joi.number().integer().min(1).required(),
    bonus_coins:   Joi.number().integer().min(0).default(0),
    price:         Joi.number().positive().required(),
    validity_days: Joi.number().integer().min(1).default(365),
    is_popular:    Joi.number().valid(0, 1).default(0),
    is_pro:        Joi.number().valid(0, 1).default(0),
    is_active:     Joi.number().valid(0, 1).default(1),
    sort_order:    Joi.number().integer().min(0).default(0),
    offer_label:   Joi.string().max(50).allow("", null),
  });

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

export const updatePlan = (req, res, next) => {
  const schema = Joi.object({
    name:          Joi.string().min(2).max(100),
    subtitle:      Joi.string().max(100).allow("", null),
    coins:         Joi.number().integer().min(1),
    bonus_coins:   Joi.number().integer().min(0),
    price:         Joi.number().positive(),
    validity_days: Joi.number().integer().min(1),
    is_popular:    Joi.number().valid(0, 1),
    is_pro:        Joi.number().valid(0, 1),
    is_active:     Joi.number().valid(0, 1),
    sort_order:    Joi.number().integer().min(0),
    offer_label:   Joi.string().max(50).allow("", null),
  }).min(1);

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};