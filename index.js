//import mongoose
const mongoose = require("mongoose");

//import cors
const cors = require("cors");
const cookieParser = require("cookie-parser");

//import express
const express = require("express");
const app = express();

//import path
const path = require("path");

//fs
const fs = require("fs");

//dotenv
require("dotenv").config({ path: ".env" });

// Redis and DB
const { connectRedis } = require('./config/redis');
const { connectDB } = require('./config/db');

// Cron jobs run in alright-cron; backend does not run any crons.

app.use(cors());
app.use(cookieParser());

app.use((req, res, next) => {
  if (req.path === "/user/subscription/webhook") {
    express.raw({ type: "application/json" })(req, res, next);
  } else if (req.path === "/premiumPlan/googlePlayWebhook") {
    express.raw({ type: "application/json" })(req, res, next);
  } else if (req.path === "/cashfree/webhooks") {
    // Skip global JSON parsing for Cashfree webhooks - handled by route-specific middleware
    next();
  } else {
    express.json({ extended: false, limit: "3gb" })(req, res, next);
  }
});

app.use(express.urlencoded({ extended: false, limit: "3gb" }));
app.use(express.static(path.join(__dirname, "public")));

//import model
const Setting = require("./server/setting/setting.model");

//Declare global variable
global.settingJSON = {};

// Export a promise that resolves when settings are initialized
let resolveSettings;
const settingsPromise = new Promise((resolve) => {
  resolveSettings = resolve;
});
module.exports = settingsPromise;

//handle global.settingJSON when pm2 restart
async function initializeSettings() {
  try {
    const setting = await Setting.findOne().sort({ createdAt: -1 }).select("+privateKey +ga4FirebaseAppId +ga4ApiSecret");
    if (setting) {
      global.settingJSON = setting;
      console.log("Settings initialized successfully");
    } else {
      global.settingJSON = {};
      console.warn("No settings found in database");
    }
  } catch (error) {
    console.error("Failed to initialize settings:", error);
    global.settingJSON = {};
  } finally {
    resolveSettings();
  }
}

//route.js
const Route = require("./route");
app.use("/", Route);

app.get("/", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "Connected" : "Disconnected";
  const settingsStatus = Object.keys(global.settingJSON).length > 0 ? "Initialized" : "Not Initialized";

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      status: "Error",
      message: "Server is running but database is not connected",
      dbStatus,
      settingsStatus
    });
  }

  res.status(200).json({
    status: "OK",
    message: "Server is running",
    dbStatus,
    settingsStatus
  });
});

//Public File Catch-all
app.get("/*", (req, res) => {
  const indexPath = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(indexPath)) {
    res.status(200).sendFile(indexPath);
  } else {
    res.status(404).json({ status: false, message: "Endpoint not found" });
  }
});

// Start Server Function
async function startServer() {
  // Initial connection to MongoDB
  await connectDB();

  try {
    // Initialize Settings after DB connection
    await initializeSettings();

    // Initialize Redis connection after MongoDB and Settings connect
    connectRedis();

    // Set port and listen the request
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log("Listening on " + PORT);
    });

  } catch (err) {
    console.error("Critical error during server initialization:", err);
    // Start server in limited mode if settings or redis fail, but DB is connected
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log("Server started in limited mode on " + PORT);
    });
  }
}

startServer();
