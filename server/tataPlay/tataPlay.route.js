//express
const express = require("express");
const route = express.Router();

//checkAccessForTataPlay
const checkAccessForTataPlay = require("../../util/checkAccessForTataPlay");

//controller
const TataPlayController = require("./tataPlay.controller");

// Get initial ingestion
route.get(
  "/ingestion/initial",
  checkAccessForTataPlay(),
  TataPlayController.initialIngestion);
// Get incremental ingestion
route.get(
  "/ingestion/increment",
  checkAccessForTataPlay(),
  TataPlayController.incrementalIngestion);

// Streaming data api
route.post(
  "/stream",
  checkAccessForTataPlay(),
  TataPlayController.streamingDataUrls);

  module.exports = route;