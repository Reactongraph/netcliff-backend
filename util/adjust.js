const axios = require('axios');
const { sendMetabaseFreeTrialEvent } = require('./metabase');
const { WEB_DOMAINS } = require('./constants');

const ADJUST_S2S_URL = 'https://s2s.adjust.com/event';
const ADJUST_APP_TOKEN = process.env.ADJUST_APP_TOKEN;
const ADJUST_WEB_APP_TOKEN = process.env.ADJUST_WEB_APP_TOKEN;
const ADJUST_WEB_S2S_TOKEN = process.env.ADJUST_WEB_S2S_TOKEN;

const ADJUST_CF_WEB_APP_TOKEN = process.env.ADJUST_CF_WEB_APP_TOKEN;
const ADJUST_CF_WEB_S2S_TOKEN = process.env.ADJUST_CF_WEB_S2S_TOKEN;

// Handling events tokens, headers according to web or mobile base upon is web app
const sendAdjustEvent = async (eventToken, userId, eventData = {}, isWebApp = false) => {
  try {

    const adjustEnvironment = global.settingJSON?.adjustEnvironment || 'sandbox';
    // Web app token for web app, other wise mobile
    let app_token = isWebApp ? ADJUST_WEB_APP_TOKEN : ADJUST_APP_TOKEN;
    // web app s2s token otherwise mobile
    let bearerToken = isWebApp ? ADJUST_WEB_S2S_TOKEN : process.env.ADJUST_S2S_TOKEN

    if(isWebApp){
      const domain = eventData?.domain;
      if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
        app_token = ADJUST_CF_WEB_APP_TOKEN;
        bearerToken = ADJUST_CF_WEB_S2S_TOKEN;
      }
    }

    const payload = {
      app_token,
      event_token: eventToken,
      s2s: '1',
      environment: adjustEnvironment,
      created_at_unix: Math.floor(Date.now() / 1000),
      created_at: new Date().toISOString()
    };

    // Add gps_adid if appAdvertisingId is provided
    if (eventData.appAdvertisingId) {
      payload.gps_adid = eventData.appAdvertisingId;
    }
    // Add web_uuid if adjustWebUUID is provided
    if (eventData.adjustWebUUID) {
      payload.web_uuid = eventData.adjustWebUUID;
    }

    // Add static ip_address for web events
    if (isWebApp) {
      payload.ip_address = eventData.ipAddress || '192.0.0.1';
    }

    // Add revenue parameters if provided
    if (eventData.revenue) {
      payload.revenue = eventData.revenue;
      payload.currency = eventData.currency || 'INR';
    }

    // Build request body manually to avoid double encoding
    const params = [];
    Object.keys(payload).forEach(key => {
      if (payload[key] !== undefined && payload[key] !== null) {
        params.push(`${key}=${encodeURIComponent(payload[key])}`);
      }
    });

    // Build callback_params: merge existing with coupon_code when provided
    let callbackParams = {};
    if (eventData.callback_params) {
      try {
        callbackParams = typeof eventData.callback_params === 'string'
          ? JSON.parse(eventData.callback_params)
          : { ...eventData.callback_params };
      } catch (e) {
        callbackParams = {};
      }
    }
    if (eventData.coupon_code !== undefined && eventData.coupon_code !== null && String(eventData.coupon_code).trim() !== '') {
      callbackParams.coupon_code = String(eventData.coupon_code).trim();
    }
    if (Object.keys(callbackParams).length > 0) {
      params.push(`callback_params=${encodeURIComponent(JSON.stringify(callbackParams))}`);
    } else if (eventData.callback_params) {
      params.push(`callback_params=${encodeURIComponent(eventData.callback_params)}`);
    }

    // Add partner_params if provided (must be URL-encoded JSON)
    if (eventData.partner_params) {
      params.push(`partner_params=${encodeURIComponent(eventData.partner_params)}`);
    }

    const requestBody = params.join('&');

    const response = await axios.post(ADJUST_S2S_URL, requestBody, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': "Bearer " + bearerToken
      }
    });

    return response.data;
  } catch (error) {
    console.error(`[Adjust] Event error - Token: ${eventToken}:`, error.response?.data || error.message);
    return null;
  }
};

const captureSubscriptionRenewedEvent = async (userId, subscriptionData = {}) => {
  const eventToken = process.env.ADJUST_SUBSCRIPTION_RENEWED_EVENT_TOKEN;
  return sendAdjustEvent(eventToken, userId, subscriptionData);
};

const captureRevenueEvent = async (userId, revenueData = {}) => {
  const eventToken = process.env.ADJUST_REVENUE_EVENT_TOKEN;
  return sendAdjustEvent(eventToken, userId, revenueData);
};

const capture3MonthPlanEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_3_MONTH_PLAN_TOKEN;
  return sendAdjustEvent(eventToken, userId, eventData);
};

const capture1MonthPlanEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_1_MONTH_PLAN_TOKEN;
  return sendAdjustEvent(eventToken, userId, eventData);
};

const capture1YearPlanEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_1_YEAR_PLAN_TOKEN;
  return sendAdjustEvent(eventToken, userId, eventData);
};

const captureFreeTrialBeEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_FREE_TRIAL_BE_TOKEN;
  return sendAdjustEvent(eventToken, userId, eventData);
};

const captureFreeTrialCancelEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_FREE_TRIAL_CANCEL_TOKEN;
  return sendAdjustEvent(eventToken, userId, eventData);
};

const captureAutoPayCancelEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_AUTO_PAY_CANCEL_TOKEN;
  return sendAdjustEvent(eventToken, userId, eventData);
};

const captureFirstChargeAttemptRaisedEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_CASHFREE_FIRST_CHARGE_ATTEMPT_RAISED;
  return sendAdjustEvent(eventToken, userId, eventData);
};

const capturePaymentFailedEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_PAYMENT_FAILED;
  return sendAdjustEvent(eventToken, userId, eventData);
};

const captureFreeTrialCashfreeEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_FREE_TRIAL_CASHFREE;;
  return sendAdjustEvent(eventToken, userId, eventData);
};

// Web-specific events (use web app token)
const captureWebSignUpEvent = async (userId, eventData = {}) => {
  let eventToken = process.env.ADJUST_WEB_SIGN_UP_TOKEN;
  const domain = eventData?.domain;
  if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
    eventToken = process.env.ADJUST_CF_WEB_SIGN_UP_TOKEN;
  }
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWebRevenueEvent = async (userId, eventData = {}) => {
  let eventToken = process.env.ADJUST_WEB_REVENUE_TOKEN;
  const domain = eventData?.domain;
  if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
    eventToken = process.env.ADJUST_CF_WEB_REVENUE_TOKEN;
  }
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWeb3MonthPlanEvent = async (userId, eventData = {}) => {
  let eventToken = process.env.ADJUST_WEB_3_MONTH_PLAN_TOKEN;
  const domain = eventData?.domain;
  if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
    eventToken = process.env.ADJUST_CF_WEB_3_MONTH_PLAN_TOKEN;
  }
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWeb1MonthPlanEvent = async (userId, eventData = {}) => {
  let eventToken = process.env.ADJUST_WEB_1_MONTH_PLAN_TOKEN;
  const domain = eventData?.domain;
  if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
    eventToken = process.env.ADJUST_CF_WEB_1_MONTH_PLAN_TOKEN;
  }
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWeb1YearPlanEvent = async (userId, eventData = {}) => {
  let eventToken = process.env.ADJUST_WEB_1_YEAR_PLAN_TOKEN;
  const domain = eventData?.domain;
  if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
    eventToken = process.env.ADJUST_CF_WEB_1_YEAR_PLAN_TOKEN;
  }
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWebFreeTrialEvent = async (userId, eventData = {}) => {
  let eventToken = process.env.ADJUST_WEB_FREE_TRIAL_BE_TOKEN;
  const domain = eventData?.domain;
  if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
    eventToken = process.env.ADJUST_CF_WEB_FREE_TRIAL_BE_TOKEN;
  }
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWebFreeTrialCancelEvent = async (userId, eventData = {}) => {
  let eventToken = process.env.ADJUST_WEB_FREE_TRIAL_CANCEL_TOKEN;
  const domain = eventData?.domain;
  if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
    eventToken = process.env.ADJUST_CF_WEB_FREE_TRIAL_CANCEL_TOKEN;
  }
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWebSubscriptionRenewedEvent = async (userId, eventData = {}) => {
  let eventToken = process.env.ADJUST_WEB_SUBSCRIPTION_RENEWED_EVENT_TOKEN;
  const domain = eventData?.domain;
  if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
    eventToken = process.env.ADJUST_CF_WEB_SUBSCRIPTION_RENEWED_EVENT_TOKEN;
  }
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWebAutoPayCancelEvent = async (userId, eventData = {}) => {
  let eventToken = process.env.ADJUST_WEB_AUTO_PAY_CANCEL_TOKEN;
  const domain = eventData?.domain;
  if(domain === WEB_DOMAINS.FREE_TRIAL_CF){
    eventToken = process.env.ADJUST_CF_WEB_AUTO_PAY_CANCEL_TOKEN;
  }
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWebFirstChargeAttemptRaisedEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_WEB_CASHFREE_FIRST_CHARGE_ATTEMPT_RAISED;
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWebPaymentFailedEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_WEB_PAYMENT_FAILED;
  return sendAdjustEvent(eventToken, userId, eventData, true);
};

const captureWebFreeTrialCashfreeEvent = async (userId, eventData = {}) => {
  const eventToken = process.env.ADJUST_WEB_FREE_TRIAL_CASHFREE;;
  return sendAdjustEvent(eventToken, userId, eventData, true);
};


// Helper to send events based on platform and advertising ID type
const sendPlatformEventToAdjust = async (userId, eventType, eventData = {}) => {
  // Extract platform from eventData (web, android, ios)
  const platform = eventData.platform || 'android';

  // Check if adjustWebUUID exists in eventData (web tracking)
  const hasAdjustWebUUID = eventData.adjustWebUUID;
  const hasAppAdvertisingId = eventData.appAdvertisingId;

  // Determine which event to send based on platform
  // Web platform should use adjustWebUUID, mobile platforms (android/ios) should use appAdvertisingId
  const shouldSendWebEvent = platform === 'web' && hasAdjustWebUUID;
  const shouldSendMobileEvent = (platform === 'android' || platform === 'ios') && hasAppAdvertisingId;

  switch (eventType) {
    case 'revenue':
      if (shouldSendMobileEvent) await captureRevenueEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWebRevenueEvent(userId, eventData);
      break;
    case '1month':
      if (shouldSendMobileEvent) await capture1MonthPlanEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWeb1MonthPlanEvent(userId, eventData);
      break;
    case '3month':
      if (shouldSendMobileEvent) await capture3MonthPlanEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWeb3MonthPlanEvent(userId, eventData);
      break;
    case '1year':
      if (shouldSendMobileEvent) await capture1YearPlanEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWeb1YearPlanEvent(userId, eventData);
      break;
    case 'freeTrial':
      if (shouldSendMobileEvent) await captureFreeTrialBeEvent(userId, eventData);
      if (shouldSendWebEvent) {
        await captureWebFreeTrialEvent(userId, eventData);
        // Trigger Metabase event for web free trial
        // await sendMetabaseFreeTrialEvent(userId, eventData);
      }
      break;
    case 'freeTrialCashfree':
      if (shouldSendMobileEvent) await captureFreeTrialCashfreeEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWebFreeTrialCashfreeEvent(userId, eventData);
      break;
    case 'freeTrialCancel':
      if (shouldSendMobileEvent) await captureFreeTrialCancelEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWebFreeTrialCancelEvent(userId, eventData);
      break;
    case 'subscriptionRenewed':
      if (shouldSendMobileEvent) await captureSubscriptionRenewedEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWebSubscriptionRenewedEvent(userId, eventData);
      break;
    case 'autoPayCancel':
      if (shouldSendMobileEvent) await captureAutoPayCancelEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWebAutoPayCancelEvent(userId, eventData);
      break;
    case 'firstChargeAttemptRaised':
      if (shouldSendMobileEvent) await captureFirstChargeAttemptRaisedEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWebFirstChargeAttemptRaisedEvent(userId, eventData);
      break;
    case 'paymentFailed':
      if (shouldSendMobileEvent) await capturePaymentFailedEvent(userId, eventData);
      if (shouldSendWebEvent) await captureWebPaymentFailedEvent(userId, eventData);
      break;
  }
};

module.exports = {
  captureSubscriptionRenewedEvent,
  captureRevenueEvent,
  capture3MonthPlanEvent,
  capture1YearPlanEvent,
  captureFreeTrialBeEvent,
  captureFreeTrialCancelEvent,
  captureAutoPayCancelEvent,
  captureWebSignUpEvent,
  captureWebRevenueEvent,
  captureWeb3MonthPlanEvent,
  captureWeb1YearPlanEvent,
  captureWebFreeTrialEvent,
  captureWebFreeTrialCancelEvent,
  captureWebSubscriptionRenewedEvent,
  captureWebAutoPayCancelEvent,
  sendPlatformEventToAdjust,
  capture1MonthPlanEvent,
  captureWeb1MonthPlanEvent,
  captureFirstChargeAttemptRaisedEvent,
  captureWebFirstChargeAttemptRaisedEvent,
  capturePaymentFailedEvent,
  captureWebPaymentFailedEvent,
  captureWebFreeTrialCashfreeEvent,
  captureFreeTrialCashfreeEvent
};