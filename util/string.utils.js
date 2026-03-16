const { v4: uuidv4 } = require("uuid");

function generateReferralCode() {
  return uuidv4().replace(/-/g, "").slice(0, 6).toUpperCase();
}

module.exports = {
  generateReferralCode,
};

