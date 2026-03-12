//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../util/checkAccess");

//Controller
const RegionController = require("./continentRegion.controller");

//create region from TMDB database
//route.post("/getStore", checkAccessWithSecretKey(), RegionController.getStore);

//create region
route.post("/create", checkAccessWithSecretKey(), RegionController.store);

//update region
route.patch("/update", checkAccessWithSecretKey(), RegionController.update);

//get region
route.get("/", checkAccessWithSecretKey(), RegionController.get);

//delete region
route.delete("/delete", checkAccessWithSecretKey(), RegionController.destroy);

route.get('/validate-update-add-country', RegionController.updateAddCountry)
route.get('/validate-update-add-cities', RegionController.updateAddCities)

module.exports = route;
