const mongoose = require("mongoose");

/**
 * Establishes a connection to MongoDB with an initial retry loop.
 * @returns {Promise<void>}
 */
const connectDB = async () => {
    const connectionString = process.env.MONGODB_CONNECTION_STRING;
    let connected = false;

    // Initial connection retry loop
    while (!connected) {
        try {
            console.log("Connecting to MongoDB...");
            await mongoose.connect(connectionString, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
            connected = true;
            console.log("MONGO: successfully connected to db");
        } catch (err) {
            console.error("MongoDB connection failed. Retrying in 5 seconds...", err.message);
            // Wait for 5 seconds before retrying
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }

    // Handle runtime connection errors after initial connection
    mongoose.connection.on("error", (err) => {
        console.error("Mongoose connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
        console.warn("Mongoose disconnected. Depending on your configuration, it may try to reconnect automatically.");
    });
};

module.exports = { connectDB };
