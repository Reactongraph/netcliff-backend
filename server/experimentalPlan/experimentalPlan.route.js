//express
const express = require("express");
const route = express.Router();

//controller
const experimentalPlanController = require("./experimentalPlan.controller");
const {
  detectAuth,
  firebaseAuthenticate,
} = require("../middleware/auth.middleware");

route.get(
  "/getPlanDetails",
  detectAuth,
  firebaseAuthenticate,
  experimentalPlanController.getExperimentalPlanDetails,
);
module.exports = route;
