//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const roleController = require("./role.controller");
const { userRoles } = require("../../util/helper");
const { authenticate, authorize } = require("../middleware/auth.middleware");

//create role
route.post("/create", authenticate, authorize([userRoles.ADMIN]), roleController.store);

//update role
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), roleController.update);

//delete role
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), roleController.destroy);

//get role
route.get("/", checkAccessWithSecretKey(), roleController.get);

//get role movieId wise
route.get("/movieIdWise", checkAccessWithSecretKey(), roleController.getIdWise);

module.exports = route;
