const axios = require('axios');

const LINKRUNNER_API_URL = 'https://api.linkrunner.io/api/v1';
const LINKRUNNER_KEY = process.env.LINKRUNNER_KEY;

const capturePayment = async (userId, paymentId, amount, type = 'DEFAULT', status = 'PAYMENT_COMPLETED') => {
  try {
    const response = await axios.post(`${LINKRUNNER_API_URL}/capture-payment`, {
      user_id: userId,
      payment_id: paymentId,
      amount: Math.round(amount),
      type,
      status
    }, {
      headers: {
        'linkrunner-key': LINKRUNNER_KEY,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('LinkRunner capture payment error:', error.response?.data || error.message);
    // Don't throw error to avoid breaking main flow
    return null;
  }
};

const captureEvent = async (eventName, userId, eventData = {}) => {
  try {
    const response = await axios.post(`${LINKRUNNER_API_URL}/capture-event`, {
      event_name: eventName,
      user_id: userId,
      event_data: eventData
    }, {
      headers: {
        'linkrunner-key': LINKRUNNER_KEY,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('LinkRunner capture event error:', error.response?.data || error.message);
    // Don't throw error to avoid breaking main flow
    return null;
  }
};

const getAttributedUsers = async (displayId, options = {}) => {
  try {
    const params = new URLSearchParams({ display_id: displayId });

    if (options.start_timestamp) params.append('start_timestamp', options.start_timestamp);
    if (options.end_timestamp) params.append('end_timestamp', options.end_timestamp);
    if (options.timezone) params.append('timezone', options.timezone);
    if (options.page) params.append('page', options.page.toString());
    if (options.limit) params.append('limit', options.limit.toString());

    const response = await axios.get(`${LINKRUNNER_API_URL}/attributed-users?${params}`, {
      headers: {
        'linkrunner-key': LINKRUNNER_KEY,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('LinkRunner get attributed users error:', error.response?.data || error.message);
    // Don't throw error to avoid breaking main flow
    return null;
  }
};

module.exports = {
  capturePayment,
  getAttributedUsers,
  captureEvent
};