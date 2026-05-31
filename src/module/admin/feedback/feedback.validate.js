import Joi from "joi";

export const submitFeedback = (req, res, next) => {
  const schema = Joi.object({
    category: Joi.string()
      .valid("uct_tuning", "feature_suggestion", "league_request", "engine_accuracy", "bug_report", "what_you_love")
      .required(),

    importance: Joi.string()
      .valid("would_really_help_my_workflow", "nice_to_have", "critical_blocking_me", "just_a_thought")
      .required(),

    subject: Joi.string().min(3).max(120).required(),

    description: Joi.string().min(10).required(),

    email: Joi.string().email().allow("", null).optional(),

    location: Joi.string().allow("", null).optional(),

    email_followup: Joi.boolean().default(false),
  });

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};