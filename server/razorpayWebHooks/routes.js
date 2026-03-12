//express
const express = require("express");
const { paymentFailed } = require("./controller");
const route = express.Router();


route.post("/webhooks/payment", paymentFailed);

module.exports = route;
