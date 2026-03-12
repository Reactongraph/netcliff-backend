/**
 * Validates and normalizes phone numbers
 * Accepts phone numbers with or without country code
 * Returns normalized phone number with +91 country code
 */
const validateAndNormalizePhone = (phoneNumber) => {
  if (!phoneNumber) {
    return {
      isValid: false,
      error: "Phone number is required"
    };
  }

  // Remove all whitespace
  let phone = phoneNumber.replace(/\s/g, '');

  // Remove country code if present
  phone = phone.replace(/^(\+91|91)/, '');

  // Validate: must contain only digits
  if (!/^\d+$/.test(phone)) {
    return {
      isValid: false,
      error: "Phone number must contain only digits"
    };
  }

  // Remove leading zeros
  phone = phone.replace(/^0+/, '');

  // Validate length: must be exactly 10 digits
  if (phone.length !== 10) {
    return {
      isValid: false,
      error: "Phone number must be exactly 10 digits"
    };
  }

  // Return normalized phone with country code
  return {
    isValid: true,
    phoneNumber: `+91${phone}`
  };
};

module.exports = { validateAndNormalizePhone };
