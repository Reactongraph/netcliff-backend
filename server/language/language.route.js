//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//controller
const GenreController = require("./language.controller");


//get genre
route.get("/", checkAccessWithSecretKey(), GenreController.get);

module.exports = route;