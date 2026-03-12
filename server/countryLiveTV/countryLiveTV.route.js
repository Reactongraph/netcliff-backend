//express
const express = require("express");
const route = express.Router();

//Controller
const CountryLiveTVController = require("./countryLiveTV.controller");
const { authenticate, authorize } = require("../middleware/auth.middleware");
const { userRoles } = require("../../util/helper");

//create countryLiveTV from IPTV for admin panel
//route.get("/getStore", authenticate, authorize([userRoles.ADMIN]), CountryLiveTVController.getStore);

//get countryLiveTV from IPTV for admin panel
route.get("/", authenticate, authorize([userRoles.ADMIN]), CountryLiveTVController.get);

//if isIptvAPI false then get country wise channel and stream ,if isIptvAPI true then get country wise channel and stream added by admin
route.get("/getStoredetail", authenticate, authorize([userRoles.ADMIN]), CountryLiveTVController.getStoredetail);

//get country wise channel and stream for admin panel
route.get("/getStoredetails", authenticate, authorize([userRoles.ADMIN]), CountryLiveTVController.getStoredetails);

module.exports = route;
