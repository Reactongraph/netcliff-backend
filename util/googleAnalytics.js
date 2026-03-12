const axios = require('axios');
const Setting = require('../server/setting/setting.model');

const sendGA4Event = async (eventName, eventParams = {}, userId = null, appInstanceId = null) => {
  try {
    const setting = await Setting.findOne().select("+ga4FirebaseAppId +ga4ApiSecret");
    if (!setting?.ga4FirebaseAppId || !setting?.ga4ApiSecret) {
      return false;
    }

    const payload = {
      app_instance_id: appInstanceId || "65a0ba9332df0354ffa768980e60b52f",
      timestamp_micros: Date.now() * 1000,
      events: [{
        name: eventName,
        params: {
          ...eventParams
        }
      }]
    };

    if (userId) {
      payload.user_id = userId;
    }

    const response = await axios.post(
      `https://www.google-analytics.com/mp/collect?api_secret=${setting.ga4ApiSecret}&firebase_app_id=${setting.ga4FirebaseAppId}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return response.status === 200 || response.status === 204;
  } catch (error) {
    console.error('GA4 Event Error:', error);
    return false;
  }
};

const trackGA4SubscriptionRenewed = async (userId, paymentId, amount, appInstanceId, currency = 'INR') => {
  return sendGA4Event('SUBSCRIPTION_RENEWED', {
    paymentId: paymentId,
    amount: amount,
    currency: currency
  }, userId, appInstanceId);
};

const trackGA4SubscriptionCreated = async (userId, paymentId, amount, appInstanceId, currency = 'INR') => {
  return sendGA4Event('DEFAULT', {
    paymentId: paymentId,
    amount: amount,
    currency: currency
  }, userId, appInstanceId);
};

const trackGA4PlanRevenue = async (userId, eventName, amount, paymentId, appInstanceId) => {
  return sendGA4Event(eventName, {
    amount: amount,
    paymentId: paymentId
  }, userId, appInstanceId);
};

const trackGA4FreeTrialBe = async (userId, paymentId, appInstanceId) => {
  return sendGA4Event('FREE_TRIAL_BE', {
    paymentId: paymentId
  }, userId, appInstanceId);
};

const trackGA4FreeTrialCancel = async (userId, paymentId, appInstanceId) => {
  return sendGA4Event('FREE_TRIAL_CANCEL', {
    paymentId: paymentId
  }, userId, appInstanceId);
};

const trackGA4AutoPayCancel = async (userId, paymentId, appInstanceId) => {
  return sendGA4Event('AUTO_PAY_CANCEL', {
    paymentId: paymentId
  }, userId, appInstanceId);
};

module.exports = {
  trackGA4SubscriptionRenewed,
  trackGA4SubscriptionCreated,
  trackGA4PlanRevenue,
  trackGA4FreeTrialBe,
  trackGA4FreeTrialCancel,
  trackGA4AutoPayCancel
};