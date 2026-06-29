import Joi from "joi";

export const addPlan = (req, res, next) => {
  const schema = Joi.object({
    name:             Joi.string().min(2).max(100).required(),
    subtitle:         Joi.string().max(100).allow("", null),
    coins:            Joi.number().integer().min(1).required(),
    bonus_coins:      Joi.number().integer().min(0).default(0),   // optional, default 0
    // matches → auto = coins + bonus_coins (no need to send)
    price:            Joi.number().positive().required(),
    currency:         Joi.string().max(10).default("GBP"),
    currency_symbol:  Joi.string().max(5).default("£"),
    validity_days:    Joi.number().integer().min(1).default(365),
    is_popular:       Joi.number().valid(0, 1).default(0),
    is_pro:           Joi.number().valid(0, 1).default(0),
    is_active:        Joi.number().valid(0, 1).default(1),
    sort_order:       Joi.number().integer().min(0).default(0),
    regular_price:    Joi.number().positive().allow(null),
    offer_price:      Joi.number().positive().allow(null),
    discount_pct:     Joi.number().integer().min(0).max(100).allow(null),
    offer_label:      Joi.string().max(50).allow("", null),
    is_offer_active:  Joi.number().valid(0, 1).default(0),
  });

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

export const updatePlan = (req, res, next) => {
  const schema = Joi.object({
    name:             Joi.string().min(2).max(100),
    subtitle:         Joi.string().max(100).allow("", null),
    coins:            Joi.number().integer().min(1),
    bonus_coins:      Joi.number().integer().min(0),
    // matches → auto recalculated in service
    price:            Joi.number().positive(),
    currency:         Joi.string().max(10),
    currency_symbol:  Joi.string().max(5),
    validity_days:    Joi.number().integer().min(1),
    is_popular:       Joi.number().valid(0, 1),
    is_pro:           Joi.number().valid(0, 1),
    is_active:        Joi.number().valid(0, 1),
    sort_order:       Joi.number().integer().min(0),
    regular_price:    Joi.number().positive().allow(null),
    offer_price:      Joi.number().positive().allow(null),
    discount_pct:     Joi.number().integer().min(0).max(100).allow(null),
    offer_label:      Joi.string().max(50).allow("", null),
    is_offer_active:  Joi.number().valid(0, 1),
  }).min(1);

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};