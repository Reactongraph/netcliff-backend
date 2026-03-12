//express
const express = require("express");
const route = express.Router();

//checkAccessForTataPlay
const checkAccessForOTTPlay = require("../../util/checkAccessForOTTPlay");

//controller
const OTTPlayController = require("./ottPlay.controller");

// Get initial ingestion
route.get(
  "/ingestion/initial",
  checkAccessForOTTPlay(),
  OTTPlayController.initialIngestion);
// Get incremental ingestion
route.get(
  "/ingestion/increment",
  checkAccessForOTTPlay(),
  OTTPlayController.incrementalIngestion);

// Streaming data api
route.post(
  "/stream",
  checkAccessForOTTPlay(),
  OTTPlayController.streamingDataUrls);

  module.exports = route;