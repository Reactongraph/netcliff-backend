const jwt = require("jsonwebtoken");
require("dotenv").config();

/**
 * Generates a JWT token with the provided payload
 * @param {Object} payload - The data to be included in the token
 * @param {string|number} [expiresIn='7d'] - Expiration time (default: 7 days). Can be a number of seconds or a string like '1h', '2d', '7d', etc.
 * @returns {string} The generated JWT token
 */
const generateToken = (payload, expiresIn = "7d") => {
  try {
    const secret = process.env.JWT_SECRET || "your-secret-key";
    return jwt.sign(payload, secret, { expiresIn });
  } catch (error) {
    console.error("Error generating token:", error);
    throw new Error("Failed to generate token");
  }
};

/**
 * Verifies a JWT token and returns the decoded payload
 * @param {string} token - The JWT token to verify
 * @returns {Object} The decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyToken = (token) => {
  try {
    const secret = process.env.JWT_SECRET || "your-secret-key";
    return jwt.verify(token, secret);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token has expired");
    } else if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    console.error("Error verifying token:", error);
    throw new Error("Failed to verify token");
  }
};
module.exports = { generateToken, verifyToken };
