//express
const express = require("express");
const route = express.Router();

//controller
const AdvertisementController = require("./advertisement.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create advertisement
route.post("/create", authenticate, authorize([userRoles.ADMIN]), AdvertisementController.store);

//update advertisement
route.patch("/update", authenticate, authorize([userRoles.ADMIN]), AdvertisementController.update);

//get advertisement
route.get("/", authenticate, authorize([userRoles.ADMIN]), AdvertisementController.getAdd);

//googleAdd handle on or off
route.patch("/googleAdd", authenticate, authorize([userRoles.ADMIN]), AdvertisementController.googleAdd);

//appAddOnOff handle
//route.patch("/appAddOnOff", checkAccessWithSecretKey(), AdvertisementController.appAddOnOff);

//appAddOn handle
//route.patch("/appAddOn", checkAccessWithSecretKey(), AdvertisementController.appAddOn);

module.exports = route;
