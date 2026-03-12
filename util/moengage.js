const axios = require('axios');

const MOENGAGE_DC = process.env.MOENGAGE_DC || '03'; // Data Center number
const MOENGAGE_WORKSPACE_ID = process.env.MOENGAGE_WORKSPACE_ID;
const MOENGAGE_API_KEY = process.env.MOENGAGE_API_KEY;

const sendMoEngageEvent = async (userId, eventName, eventData = {}) => {
  try {
    const payload = {
      type: 'event',
      customer_id: userId,
      actions: [{
        action: eventName,
        attributes: eventData,
        current_time: Date.now().toString()
      }]
    };

    const response = await axios.post(`https://api-${MOENGAGE_DC}.moengage.com/v1/event/${MOENGAGE_WORKSPACE_ID}?app_id=${MOENGAGE_WORKSPACE_ID}`, payload, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${MOENGAGE_WORKSPACE_ID}:${MOENGAGE_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('MoEngage event error:', error.response?.data || error.message);
    return null;
  }
};

const captureSubscriptionRenewedEvent = async (userId, subscriptionData = {}) => {
  return sendMoEngageEvent(userId, 'SUBSCRIPTION_RENEWED', subscriptionData);
};

const captureRevenueEvent = async (userId, revenueData = {}) => {
  return sendMoEngageEvent(userId, 'REVENUE', revenueData);
};

const capture3MonthPlanEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'THREE_MONTH_PLAN_REVENUE', eventData);
};

const capture1MonthPlanEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'ONE_MONTH_PLAN_REVENUE', eventData);
};

const capture1YearPlanEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'ONE_YEAR_PLAN_REVENUE', eventData);
};

const captureFreeTrialCancelEvent = async (userId, cancelData = {}) => {
  return sendMoEngageEvent(userId, 'FREE_TRIAL_CANCEL', cancelData);
};

const captureAutoPayCancelEvent = async (userId, cancelData = {}) => {
  return sendMoEngageEvent(userId, 'AUTO_PAY_CANCEL', cancelData);
};

const captureFreeTrialBeEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'FREE_TRIAL_BE', eventData);
};

const captureSignUpEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'SIGN_UP', eventData);
};

const moengageTrackUser = async (userId, userAttributes = {}) => {
  try {
    const payload = {
      type: 'customer',
      customer_id: userId,
      attributes: userAttributes
    };

    const response = await axios.post(`https://api-${MOENGAGE_DC}.moengage.com/v1/customer/${MOENGAGE_WORKSPACE_ID}`, payload, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${MOENGAGE_WORKSPACE_ID}:${MOENGAGE_API_KEY}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('MoEngage user tracking error:', error.response?.data || error.message);
    return null;
  }
};

const captureWebSubscriptionRenewedEvent = async (userId, subscriptionData = {}) => {
  return sendMoEngageEvent(userId, 'WEB_SUBSCRIPTION_RENEWED', subscriptionData);
};

const captureWebRevenueEvent = async (userId, revenueData = {}) => {
  return sendMoEngageEvent(userId, 'WEB_REVENUE', revenueData);
};

const captureWeb3MonthPlanEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'WEB_THREE_MONTH_PLAN_REVENUE', eventData);
};

const captureWeb1MonthPlanEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'WEB_ONE_MONTH_PLAN_REVENUE', eventData);
};

const captureWeb1YearPlanEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'WEB_ONE_YEAR_PLAN_REVENUE', eventData);
};

const captureWebFreeTrialCancelEvent = async (userId, cancelData = {}) => {
  return sendMoEngageEvent(userId, 'WEB_FREE_TRIAL_CANCEL', cancelData);
};

const captureWebAutoPayCancelEvent = async (userId, cancelData = {}) => {
  return sendMoEngageEvent(userId, 'WEB_AUTO_PAY_CANCEL', cancelData);
};

const captureWebFreeTrialBeEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'WEB_FREE_TRIAL_BE', eventData);
};

const captureWebSignUpEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'WEB_SIGN_UP', eventData);
};

const captureCashfreePaymentInitiatedEvent = async (userId, eventData = {}, isWeb) => {
  return sendMoEngageEvent(userId, !isWeb ? 'CASHFREE_PAYMENT_INITIATED' : 'WEB_CASHFREE_PAYMENT_INITIATED', eventData);
};

const captureCashfreeVerificationAPIStatusEvent = async (userId, eventData = {}, isWeb) => {
  return sendMoEngageEvent(userId, !isWeb ? 'CASHFREE_INSTANT_API_STATUS' : 'WEB_CASHFREE_INSTANT_API_STATUS', eventData);
};

const captureCashfreeAuthSuccessWebhookEvent = async (userId, eventData = {}, isWeb) => {
  return sendMoEngageEvent(userId, !isWeb ? 'CASHFREE_AUTH_SUCCESS_WEBHOOK_RECEIVED' : 'WEB_CASHFREE_AUTH_SUCCESS_WEBHOOK_RECEIVED', eventData);
};

const captureCashfreeAuthFailedWebhookEvent = async (userId, eventData = {}, isWeb) => {
  return sendMoEngageEvent(userId, !isWeb ? 'CASHFREE_AUTH_FAILED_WEBHOOK_RECEIVED' : 'WEB_CASHFREE_AUTH_FAILED_WEBHOOK_RECEIVED', eventData);
}

const captureCashfreeChargePaymentFailedWebhookEvent = async (userId, eventData = {}, isWeb) => {
  return sendMoEngageEvent(userId, !isWeb ? 'CASHFREE_CHARGE_PAYMENT_FAILED_WEBHOOK_RECEIVED' : 'WEB_CASHFREE_CHARGE_PAYMENT_FAILED_WEBHOOK_RECEIVED', eventData);
}

const captureCashfreeChargePaymentSuccessWebhookEvent = async (userId, eventData = {}, isWeb) => {
  return sendMoEngageEvent(userId, !isWeb ? 'CASHFREE_CHARGE_PAYMENT_SUCCESS_WEBHOOK_RECEIVED' : 'WEB_CASHFREE_CHARGE_PAYMENT_SUCCESS_WEBHOOK_RECEIVED', eventData);
}

const captureCashfreeSubscriptionCancelledWebhookEvent = async (userId, eventData = {}, isWeb) => {
  return sendMoEngageEvent(userId, !isWeb ? 'CASHFREE_SUBSCRIPTION_CANCELLED_WEBHOOK_RECEIVED' : 'WEB_CASHFREE_SUBSCRIPTION_CANCELLED_WEBHOOK_RECEIVED', eventData);
}

const captureCashfreeFreeTrialCancelledEvent = async (userId, eventData = {}, isWeb) => {
  return sendMoEngageEvent(userId, !isWeb ? 'CASHFREE_FREE_TRIAL_CANCELLED' : 'WEB_CASHFREE_FREE_TRIAL_CANCELLED', eventData);
};

const captureCashfreeChargeAttemptRaisedEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'CASHFREE_CHARGE_ATTEMPT_RAISED', eventData);
};

const captureCashfreeChargeScheduleFailedEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'CASHFREE_CHARGE_SCHEDULE_FAILED', eventData);
};

const captureCashfreeChargeAttemptStatusEvent = async (userId, eventData = {}) => {
  return sendMoEngageEvent(userId, 'CASHFREE_CHARGE_ATTEMPT_STATUS', eventData);
};


const sendPlatformEventToMoEngage = async (userId, eventType, eventData = {}) => {
  const platform = eventData.platform || 'android';

  const isWeb = platform === 'web';

  switch (eventType) {
    case 'revenue':
      if (isWeb) await captureWebRevenueEvent(userId, eventData);
      else await captureRevenueEvent(userId, eventData);
      break;
    case '3month':
      if (isWeb) await captureWeb3MonthPlanEvent(userId, eventData);
      else await capture3MonthPlanEvent(userId, eventData);
      break;
    case '1month':
      if (isWeb) await captureWeb1MonthPlanEvent(userId, eventData);
      else await capture1MonthPlanEvent(userId, eventData);
      break;
    case '1year':
      if (isWeb) await captureWeb1YearPlanEvent(userId, eventData);
      else await capture1YearPlanEvent(userId, eventData);
      break;
    case 'freeTrial':
      if (isWeb) await captureWebFreeTrialBeEvent(userId, eventData);
      else await captureFreeTrialBeEvent(userId, eventData);
      break;
    case 'freeTrialCancel':
      if (isWeb) await captureWebFreeTrialCancelEvent(userId, eventData);
      else await captureFreeTrialCancelEvent(userId, eventData);
      break;
    case 'subscriptionRenewed':
      if (isWeb) await captureWebSubscriptionRenewedEvent(userId, eventData);
      else await captureSubscriptionRenewedEvent(userId, eventData);
      break;
    case 'autoPayCancel':
      if (isWeb) await captureWebAutoPayCancelEvent(userId, eventData);
      else await captureAutoPayCancelEvent(userId, eventData);
      break;
    case 'signUp':
      if (isWeb) await captureWebSignUpEvent(userId, eventData);
      else await captureSignUpEvent(userId, eventData);
      break;
    case 'cashfreePaymentInitiated':
      await captureCashfreePaymentInitiatedEvent(userId, eventData, isWeb);
      break;
    case 'cashfreeVerificationAPIStatus':
      await captureCashfreeVerificationAPIStatusEvent(userId, eventData, isWeb);
      break;
    case 'cashfreeAuthSuccessWebhookReceived':
      await captureCashfreeAuthSuccessWebhookEvent(userId, eventData, isWeb);
      break;
    case 'cashfreeAuthFailedWebhookReceived':
      await captureCashfreeAuthFailedWebhookEvent(userId, eventData, isWeb);
      break;
    case 'cashfreeChargePaymentFailedWebhookReceived':
      await captureCashfreeChargePaymentFailedWebhookEvent(userId, eventData, isWeb);
      break;
    case 'cashfreeChargePaymentSuccessWebhookReceived':
      await captureCashfreeChargePaymentSuccessWebhookEvent(userId, eventData, isWeb);
      break;
    case 'cashfreeSubscriptionCancelledWebhookReceived':
      await captureCashfreeSubscriptionCancelledWebhookEvent(userId, eventData, isWeb);
      break;
    case 'cashfreeFreeTrialCancelled':
      await captureCashfreeFreeTrialCancelledEvent(userId, eventData, isWeb);
      break;
    case 'cashfreeChargeAttemptRaised':
      await captureCashfreeChargeAttemptRaisedEvent(userId, eventData);
      break;
    case 'cashfreeChargeScheduleFailed':
      await captureCashfreeChargeScheduleFailedEvent(userId, eventData);
      break;
    case 'cashfreeChargeAttemptStatus':
      await captureCashfreeChargeAttemptStatusEvent(userId, eventData);
      break;
  }
};

module.exports = {
  captureSubscriptionRenewedEvent,
  captureRevenueEvent,
  capture3MonthPlanEvent,
  capture1YearPlanEvent,
  captureFreeTrialCancelEvent,
  captureAutoPayCancelEvent,
  captureFreeTrialBeEvent,
  moengageTrackUser,
  capture1MonthPlanEvent,

  // Web Events
  captureWebSubscriptionRenewedEvent,
  captureWebRevenueEvent,
  captureWeb3MonthPlanEvent,
  captureWeb1YearPlanEvent,
  captureWebFreeTrialCancelEvent,
  captureWebAutoPayCancelEvent,
  captureWebFreeTrialBeEvent,
  captureWeb1MonthPlanEvent,
  captureSignUpEvent,
  captureWebSignUpEvent,

  // Common Cashfree Events
  captureCashfreePaymentInitiatedEvent,
  captureCashfreeVerificationAPIStatusEvent,
  captureCashfreeFreeTrialCancelledEvent,
  captureCashfreeChargeAttemptRaisedEvent,
  captureCashfreeChargeScheduleFailedEvent,
  captureCashfreeChargeAttemptStatusEvent,
  captureCashfreeAuthSuccessWebhookEvent,
  captureCashfreeAuthFailedWebhookEvent,
  captureCashfreeChargePaymentFailedWebhookEvent,
  captureCashfreeChargePaymentSuccessWebhookEvent,
  captureCashfreeSubscriptionCancelledWebhookEvent,

  // Platform Dispatcher
  sendPlatformEventToMoEngage
};
