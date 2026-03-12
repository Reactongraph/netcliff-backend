//express
const express = require("express");
const route = express.Router();

//controller
const BadgeController = require("./badge.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create badge
route.post("/create", authenticate, authorize([userRoles.ADMIN]), BadgeController.store);

//update badge
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), BadgeController.update);

//delete badge
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), BadgeController.destroy);

//get badges
route.get("/", authenticate, authorize([userRoles.ADMIN]), BadgeController.get);

//update badge metrics
route.patch("/updateMetrics", authenticate, authorize([userRoles.ADMIN]), BadgeController.updateMetrics);

module.exports = route;