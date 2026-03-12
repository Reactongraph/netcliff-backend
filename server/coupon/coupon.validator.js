const Joi = require("joi");

const validateCouponSchema = Joi.object({
  couponCode: Joi.string().trim().uppercase().min(1).max(50).required(),
});

const applyCouponSchema = Joi.object({
  couponCode: Joi.string().trim().uppercase().min(1).max(50).required(),
});

const bulkInsertSchema = Joi.object({
  codes: Joi.array()
    .items(Joi.string().trim().uppercase().min(1).max(50))
    .min(1)
    .max(10000)
    .required(),
  premiumplanId: Joi.string().hex().length(24).required(),
  campaignName: Joi.string().trim().min(1).max(200).required(),
  campaignSource: Joi.string().trim().min(1).max(200).required(),
  validityDate: Joi.date().iso().greater("now").required(),
  override: Joi.object({
    trialDays: Joi.number().integer().min(0),
    price: Joi.number().min(0),
    duration: Joi.number().integer().min(1),
  }).required(),
});

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map((d) => d.message);
      return res.status(400).json({
        status: false,
        message: "Validation failed",
        errors: messages,
      });
    }

    req.body = value;
    next();
  };
}

module.exports = {
  validateCouponSchema,
  applyCouponSchema,
  bulkInsertSchema,
  validate,
};
