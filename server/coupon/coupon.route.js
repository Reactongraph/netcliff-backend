const express = require("express");
const route = express.Router();

const checkAccessWithSecretKey = require("../../util/checkAccess");
const {
  authenticate,
  authorize,
  firebaseAuthenticate,
} = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

const couponController = require("./coupon.controller");
const {
  validate,
  validateCouponSchema,
  applyCouponSchema,
  bulkInsertSchema,
} = require("./coupon.validator");

route.post(
  "/validate",
  checkAccessWithSecretKey(),
  validate(validateCouponSchema),
  couponController.validate
);

route.post(
  "/apply",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  validate(applyCouponSchema),
  couponController.apply
);

route.post(
  "/release-expired",
  authenticate,
  authorize([userRoles.ADMIN]),
  couponController.releaseExpired
);

route.post(
  "/cancel",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  validate(applyCouponSchema),
  couponController.cancel
);

route.post(
  "/bulk-insert",
  authenticate,
  authorize([userRoles.ADMIN]),
  validate(bulkInsertSchema),
  couponController.bulkInsert
);

module.exports = route;
