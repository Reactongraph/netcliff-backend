//express
const express = require("express");
const route = express.Router();

//controller
const FavoriteController = require("./favorite.controller");
const { authenticate, authorize, firebaseAuthenticate } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//unfavorite and favorite (supports both movies and TV episodes)
route.post("/", firebaseAuthenticate , authorize([userRoles.USER]), FavoriteController.store);

//get Favorite List [For Android] - All favorites or filtered by type
route.get("/favoriteMovie", firebaseAuthenticate, authorize([userRoles.USER]), FavoriteController.getFavoriteList);

//check hero widget favorites for logged-in user
route.get("/heroWidgetFavorites", firebaseAuthenticate, authorize([userRoles.USER]), FavoriteController.checkHeroWidgetFavorites);

module.exports = route;
