import Joi from "joi";

export const addBanner = (req, res, next) => {
  const schema = Joi.object({
    name:        Joi.string().min(2).max(200).required(),
    image_url:   Joi.string().uri().required(),
    description: Joi.string().max(1000).allow("", null),
    link:        Joi.string().uri().allow("", null),
    is_active:   Joi.number().valid(0, 1).default(1),
    sort_order:  Joi.number().integer().min(0).default(0),
  });

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};

export const updateBanner = (req, res, next) => {
  const schema = Joi.object({
    name:        Joi.string().min(2).max(200),
    image_url:   Joi.string().uri(),
    description: Joi.string().max(1000).allow("", null),
    link:        Joi.string().uri().allow("", null),
    is_active:   Joi.number().valid(0, 1),
    sort_order:  Joi.number().integer().min(0),
  }).min(1);

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};