//express
const express = require("express");
const route = express.Router();

//controller
const controller = require("./contactQuery.controller");
const { authenticate, authorize, firebaseAuthenticate  } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

route.post("/", firebaseAuthenticate, authorize([userRoles.USER]), controller.create);

route.get(
  "/",
  authenticate,
  authorize([userRoles.ADMIN]),
  controller.getAllForAdmin
);

route.put(
  "/solve",
  authenticate,
  authorize([userRoles.ADMIN]),
  controller.solve
);

route.get(
  "/my-queries",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  controller.getAllForUser
);

module.exports = route;
