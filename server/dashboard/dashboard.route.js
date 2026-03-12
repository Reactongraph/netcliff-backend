//express
const express = require("express");
const route = express.Router();

//controller
const DashboardController = require("./dashboard.controller");

const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//get Admin Panel Dashboard
route.get("/admin", authenticate, authorize([userRoles.ADMIN]), DashboardController.dashboard);

//get date wise analytic for movie and webseries
route.get("/movieAnalytic", authenticate, authorize([userRoles.ADMIN]), DashboardController.movieAnalytic);

//get date wise analytic for user and revenue
route.get("/userAnalytic", authenticate, authorize([userRoles.ADMIN]), DashboardController.userAnalytic);

module.exports = route;
