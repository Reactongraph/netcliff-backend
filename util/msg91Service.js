const msg91 = require('msg91').default;

msg91.initialize({
  authKey: process.env.MSG91_AUTH_KEY
});

const TEMPLATE_IDS = {
  freeTrialWeb: process.env.MSG91_TEMPLATE_FREE_TRIAL_WEB,
  freeTrialNewWeb: process.env.MSG91_TEMPLATE_FREE_TRIAL_NEW_WEB,
  app: process.env.MSG91_TEMPLATE_APP,
  default: process.env.MSG91_TEMPLATE_DEFAULT,
};

const otpInstances = {};
for (const [key, templateId] of Object.entries(TEMPLATE_IDS)) {
  otpInstances[key] = msg91.getOTP(templateId, { length: 6 });
}

const resolveOTPInstance = (platform, origin) => {
  if (platform === 'web' && origin) {
    if (origin.includes('freetrialnew.alright.watch')) {
      return otpInstances.freeTrialNewWeb;
    }
    if (origin.includes('freetrial.alright.watch')) {
      return otpInstances.freeTrialWeb;
    }
  }

  if (platform === 'android' || platform === 'ios') {
    return otpInstances.app;
  }

  return otpInstances.default;
};

// Helper function to check if a phone number is a test number
const isTestPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return false;

  const settings = global.settingJSON || {};

  // Get test phone numbers from settings
  const testPhoneNumbers = settings.testPhoneNumbers || [];

  // Check for exact match in test phone numbers list
  if (testPhoneNumbers.includes(phoneNumber)) {
    return true;
  }

  // Get test phone number series from settings
  const testPhoneNumberSeries = settings.testPhoneNumberSeries || [];

  // Check if phone number starts with any of the defined series/prefixes
  if (Array.isArray(testPhoneNumberSeries)) {
    for (const series of testPhoneNumberSeries) {
      if (series && phoneNumber.startsWith(series)) {
        return true;
      }
    }
  }

  return false;
};

// Helper function to get test OTP code
const getTestOtpCode = () => {
  const settings = global.settingJSON || {};
  return settings.testOtpCode
};

// Validate phone number format
const validatePhoneNumber = (phoneNumber) => {
  // Basic validation - accepts various formats
  const phoneRegex = /^(\+\d{1,3}[- ]?)?\d{10,14}$/;

  if (!phoneNumber || !phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
    return {
      isValid: false,
      error: "Invalid phone number format"
    };
  }

  return {
    isValid: true,
    phoneNumber: phoneNumber.trim() // Keep original format
  };
};


// Send OTP using MSG91's official API
const sendOTP = async (phoneNumber, { platform, origin } = {}) => {
  try {
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Check if this is a test phone number
    if (isTestPhoneNumber(phoneNumber)) {
      const testOtp = getTestOtpCode();
      return {
        success: true,
        messageId: 'test-message-id',
        response: { message: 'Test OTP sent successfully' }
      };
    }

    const otpInstance = resolveOTPInstance(platform, origin);
    const response = await otpInstance.send(phoneNumber).then(response => {
      return response;
    });

    return {
      success: true,
      messageId: response.request_id || response.message_id || response.id,
      response: response
    };
  } catch (error) {
    console.error('MSG91 Send OTP Error:', error);
    throw new Error( error?.message ?? `Failed to send OTP`);
  }
};

// Verify OTP using MSG91's official verification service
const verifyOTP = async (phoneNumber, otpCode) => {
  try {
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Check if this is a test phone number
    if (isTestPhoneNumber(phoneNumber)) {
      const testOtp = getTestOtpCode();
      const isValid = Number(otpCode) === Number(testOtp);

      if (isValid) {
        return {
          isValid: true,
          response: { message: 'Test OTP verified successfully' }
        };
      } else {
        return {
          isValid: false,
          response: { message: 'Invalid test OTP' },
          error: 'Invalid OTP code'
        };
      }
    }

    try {
      const otpInstance = resolveOTPInstance();
      const response = await otpInstance.verify(phoneNumber, otpCode);

      // Check for success message patterns
      if (response.message && (
        response.message.toLowerCase().includes('success') ||
        response.message.toLowerCase().includes('verified')
      )) {
        // Check if it's "already verified" which should be an error
        if (response.message.toLowerCase().includes('already verified')) {
          return {
            isValid: false,
            response: response,
            error: 'Mobile number already verified. Please request a new OTP.'
          };
        }

        return {
          isValid: true,
          response: response
        };
      }

      // Check for success type/status
      if (response.type === 'success' ||
        response.status === 'success' ||
        response.success === true) {
        return {
          isValid: true,
          response: response
        };
      }

      // If we get here, verification failed
      return {
        isValid: false,
        response: response,
        error: response.message || 'OTP verification failed'
      };
    } catch (error) {
      console.error('MSG91 Verify OTP Error:', error);

      // Special case: Check for "already verified" error
      if (error.message && error.message.toLowerCase().includes('already verified')) {
        console.log('Number already verified - treating as error:', error.message);
        return {
          isValid: false,
          response: { message: error.message },
          error: 'Mobile number already verified. Please request a new OTP.'
        };
      }

      // Check for other success indicators
      if (error.message && (
        error.message.toLowerCase().includes('success') ||
        error.message.toLowerCase().includes('verified')
      )) {
        console.log('Treating as success despite error:', error.message);
        return {
          isValid: true,
          response: { message: error.message }
        };
      }

      return {
        isValid: false,
        error: error.message
      };
    }
  } catch (error) {
    console.error('Phone validation error:', error);
    return {
      isValid: false,
      error: error.message
    };
  }
};

// Resend OTP using MSG91's official retry service
const resendOTP = async (phoneNumber) => {
  try {
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Check if this is a test phone number
    if (isTestPhoneNumber(phoneNumber)) {
      const testOtp = getTestOtpCode();
      console.log(`[TEST MODE] Resent OTP for ${phoneNumber}: ${testOtp}`);
      return {
        success: true,
        messageId: 'test-message-id',
        response: { message: 'Test OTP resent successfully' }
      };
    }

    const otpInstance = resolveOTPInstance();
    const response = await otpInstance.retry(phoneNumber);

    console.log('MSG91 Resend OTP Response:', response);

    return {
      success: true,
      messageId: response.request_id || response.message_id || response.id,
      response: response
    };
  } catch (error) {
    console.error('MSG91 Resend OTP Error:', error);
    throw new Error( error?.message ?? `Failed to resend OTP`);
  }
};

module.exports = {
  sendOTP,
  verifyOTP,
  resendOTP,
  validatePhoneNumber,
  isTestPhoneNumber,
  getTestOtpCode
}; 