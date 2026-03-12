//express
const express = require("express");
const route = express.Router();

//Controller
const CityController = require("./cities.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//get region
route.get("/", authenticate, authorize([userRoles.ADMIN, userRoles.USER]), CityController.get);
route.post("/create", authenticate, authorize([userRoles.ADMIN, userRoles.USER]), CityController.store);
route.patch("/update", authenticate, authorize([userRoles.ADMIN, userRoles.USER]), CityController.update);
route.delete("/delete", authenticate, authorize([userRoles.ADMIN, userRoles.USER]), CityController.destroy);

module.exports = route;
