const axios = require('axios');
const crypto = require('crypto');

const FB_PIXEL_ID = process.env.FB_PIXEL_ID;
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const FB_API_VERSION = 'v20.0';

/**
 * Hash data using SHA256 as required by Facebook Conversion API
 * @param {string} data 
 * @returns {string} hashed data
 */
const hashData = (data) => {
    if (!data) return null;
    return crypto.createHash('sha256').update(String(data).trim().toLowerCase()).digest('hex');
};

/**
 * Send Free Trial event to Facebook (Metabase)
 * @param {string} userId 
 * @param {object} eventData 
 */
const sendMetabaseFreeTrialEvent = async (userId, eventData = {}) => {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const externalId = hashData(eventData.adjustWebUUID);

        const payload = {
            "data": [
                {
                    "event_name": "StartTrial",
                    "event_time": timestamp,
                    "action_source": "website",
                    "event_source_url": eventData.event_source_url || "https://freetrial.alright.watch/",
                    "event_id": `starttrial_${userId}_${timestamp}`,
                    "user_data": {
                        "external_id": [externalId]
                    }
                }
            ]
        };

        // Add test event code if provided in environment variables for testing
        // if (process.env.FB_TEST_EVENT_CODE) {
        //     payload.test_event_code = process.env.FB_TEST_EVENT_CODE;
        // } else if (global.settingJSON?.adjustEnvironment === 'sandbox') {
        //     // Default test code from user request if in sandbox/test mode
        //     payload.test_event_code = "TEST18034";
        // }

        const url = `https://graph.facebook.com/${FB_API_VERSION}/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`;

        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('[Metabase] Event sent successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('[Metabase] Event error:', error.response?.data || error.message);
        return null;
    }
};

module.exports = {
    sendMetabaseFreeTrialEvent
};
