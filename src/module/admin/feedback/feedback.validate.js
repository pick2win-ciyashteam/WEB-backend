import Joi from "joi";

export const FEEDBACK_CATEGORIES = [
  "bug_report",
  "feature_suggestion",
  "uct_tuning_request",
  "uct_workflow",
  "league_coverage_request",
  "what_you_love",
  "other_general",
];

export const FEEDBACK_PRIORITIES = ["critical", "high", "medium", "low"];

export const FEEDBACK_LOCATIONS = ["anywhere_general", "uct_configuration_step", "run_uct", "my_teams_view"];

export const FEEDBACK_REPRODUCIBLE = ["always", "sometimes", "once", "cannot_reproduce"];

export const FEEDBACK_DEVICES = ["mobile", "tablet", "desktop", "other"];

export const FEEDBACK_BROWSERS = ["chrome", "safari", "firefox", "edge", "app_android", "app_ios", "other"];

export const submitFeedback = (req, res, next) => {
  const schema = Joi.object({
    category: Joi.string()
      .valid(...FEEDBACK_CATEGORIES)
      .required(),

    priority: Joi.string()
      .valid(...FEEDBACK_PRIORITIES)
      .required(),

    subject: Joi.string().min(3).max(120).required(),

    description: Joi.string().min(10).max(5000).required(),

    email: Joi.string().email().allow("", null).optional(),

    location: Joi.string().valid(...FEEDBACK_LOCATIONS).allow("", null).optional(),

    reproducible: Joi.string().valid(...FEEDBACK_REPRODUCIBLE).allow("", null).optional(),

    device: Joi.string().valid(...FEEDBACK_DEVICES).allow("", null).optional(),

    browser: Joi.string().valid(...FEEDBACK_BROWSERS).allow("", null).optional(),

    related_match: Joi.string().max(255).allow("", null).optional(),

    uct_number: Joi.string().max(50).allow("", null).optional(),

    team_number: Joi.string().max(50).allow("", null).optional(),

    email_followup: Joi.boolean().default(false),
  });

  const { error } = schema.validate(req.body);
  if (error)
    return res.status(400).json({ success: false, message: error.details[0].message });
  next();
};
