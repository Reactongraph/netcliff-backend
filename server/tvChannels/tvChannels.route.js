//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//Controller
const tvChannelsController = require("./tvChannels.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

route.get("/", authenticate, authorize([userRoles.ADMIN]), tvChannelsController.get);
route.post("/", authenticate, authorize([userRoles.ADMIN]), tvChannelsController.create);
route.put('/', authenticate, authorize([userRoles.ADMIN]), tvChannelsController.update)
route.delete('/', authenticate, authorize([userRoles.ADMIN]), tvChannelsController.destroy)

route.get("/user", firebaseAuthenticate, authorize([userRoles.USER]), tvChannelsController.getForUsers);

module.exports = route;
