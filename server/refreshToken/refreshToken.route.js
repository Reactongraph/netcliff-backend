const express = require("express");
const route = express.Router();

const RefreshTokenController = require("./refreshToken.controller");

// Refresh access token
route.post("/refresh-token", RefreshTokenController.refreshToken);

// Revoke refresh token (logout)
route.post("/revoke-token", RefreshTokenController.revokeToken);

module.exports = route;

