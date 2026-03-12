const express = require("express");
const route = express.Router();

const FlagController = require("./flag.controller");
const checkAccessWithSecretKey = require("../../util/checkAccess");


//create flag for countryLiveTv
//route.post("/create", checkAccessWithSecretKey(), FlagController.store);

//get commission
route.get("/", checkAccessWithSecretKey(), FlagController.index);

module.exports = route;
