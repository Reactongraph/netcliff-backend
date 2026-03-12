//express
const express = require("express");
const route = express.Router();

//controller
const contactController = require("./contactUs.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create contactUs
route.post("/create", authenticate, authorize([userRoles.ADMIN]), contactController.store);

//update contactUs
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), contactController.update);

//delete contactUs
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), contactController.destroy);

//get contactUs
route.get("/", authenticate, authorize([userRoles.ADMIN]), contactController.get);

module.exports = route;
