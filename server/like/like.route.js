//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const LikeController = require("./like.controller");
const { authenticate, authorize, jwtAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//like and unlike (supports both movies and TV episodes)
route.post("/", jwtAuthenticate, authorize([userRoles.USER]), LikeController.likeAndUnlike);

//get Like List [For Android] - All likes or filtered by type
route.get("/likeMovie", jwtAuthenticate, authorize([userRoles.USER]), LikeController.getLikeList);

module.exports = route;
