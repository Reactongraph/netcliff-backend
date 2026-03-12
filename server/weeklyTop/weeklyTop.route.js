//express
const express = require("express");
const route = express.Router();

//controller
const ViewedController = require("./viewedContent.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

route.post(
  "/",
  firebaseAuthenticate,
  authorize([userRoles.USER]),
  ViewedController.store
);

module.exports = route;
