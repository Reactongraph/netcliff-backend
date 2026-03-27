//express
const express = require("express");
const route = express.Router();

//controller
const controller = require("./adBanner.controller");
const { authenticate, authorize, jwtAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

route.post("/", authenticate, authorize([userRoles.ADMIN]), controller.create);

route.get(
  "/",
  authenticate,
  authorize([userRoles.ADMIN]),
  controller.getAllForAdmin
);

route.get(
  "/active",
  jwtAuthenticate,
  authorize([userRoles.USER]),
  controller.getActiveForUser
);

//ticket of particular user solved or not
route.put(
  "/change-status",
  authenticate,
  authorize([userRoles.ADMIN]),
  controller.changeStatus
);

//get all raised tickets for user
route.delete(
  "/",
  authenticate,
  authorize([userRoles.ADMIN]),
  controller.delete
);

module.exports = route;
