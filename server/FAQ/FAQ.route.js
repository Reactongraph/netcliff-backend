//express
const express = require("express");
const route = express.Router();

//controller
const FAQController = require("./FAQ.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create FAQ
route.post(
  "/create",
  authenticate,
  authorize(userRoles.ADMIN),
  FAQController.store
);

//update FAQ
route.patch(
  "/update",
  authenticate,
  authorize(userRoles.ADMIN),
  FAQController.update
);

//delete FAQ
route.delete(
  "/delete",
  authenticate,
  authorize(userRoles.ADMIN),
  FAQController.destroy
);

//get FAQ
route.get(
  "/",
  authenticate,
  authorize([userRoles.ADMIN, userRoles.USER]),
  FAQController.get
);

module.exports = route;
