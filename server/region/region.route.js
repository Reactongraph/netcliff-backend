//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//Controller
const RegionController = require("./region.controller");
const { userRoles } = require("../../util/helper");
const { authenticate, authorize } = require("../middleware/auth.middleware");

//create region from TMDB database
//route.post("/getStore", checkAccessWithSecretKey(), RegionController.getStore);

//create region
route.post("/create", authenticate, authorize([userRoles.ADMIN]), RegionController.store);

//update region
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), RegionController.update);

//get region
route.get("/", checkAccessWithSecretKey(), RegionController.get);

//delete region
route.delete("/delete", authenticate, authorize([userRoles.ADMIN]), RegionController.destroy);

module.exports = route;
