// Subscription Types
const SUBSCRIPTION_TYPES = {
  FREE: 'FREE',
  "FREE-TRAIL": "FREE-TRAIL",
  PREMIUM: 'PREMIUM'
};

// Content Status
const CONTENT_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED'
};

// Campaign Types (Placement Types within Brand Integration)
const CAMPAIGN_TYPES = {
  PRODUCT_POPUP: 'PRODUCT_POPUP',
  QUIZ: 'QUIZ',
  ASTON: 'ASTON'
  // TODO: Add future placement types here (WATCH_TO_EARN, PLAYABLE_ADS, etc.)
};

// Campaign Target Levels
const CAMPAIGN_TARGET_LEVELS = {
  EPISODE: 'EPISODE',
  SERIES: 'SERIES'
  // TODO: Add GLOBAL level when needed
};

// Campaign Event Types
const CAMPAIGN_EVENT_TYPES = {
  ASTON_IMPRESSION: 'aston_impression',
  ASTON_CLICK_SAVE: 'aston_click_save',
  OUTBOUND_CLICK: 'outbound_click'
};

const CASHFREE_PLAN_TYPE = {
  PERIODIC: 'PERIODIC',
  ON_DEMAND: 'ON_DEMAND'
};

const CASHFREE_PAYMENT_TYPE = {
  AUTH: 'AUTH',
  CHARGE: 'CHARGE'
};

const UPI_APPS = {
  PHONEPE: 'PHONEPE',
  PAYTM: 'PAYTM', 
  GPAY: 'GPAY',
  BHIM: 'BHIM',
  AMAZON_PAY: 'AMAZON_PAY'
}

const SUBSCRIPTION_AUTH_STATUS = {
  ACTIVE: "ACTIVE",
  FAILED: "FAILED",
  INITIALIZED: "INITIALIZED"
}

// MoEngage Event Types
const MOENGAGE_EVENTS = {
  CASHFREE_CHARGE_ATTEMPT_RAISED: 'cashfreeChargeAttemptRaised',
  CASHFREE_CHARGE_ATTEMPT_STATUS: 'cashfreeChargeAttemptStatus',
  CASHFREE_CHARGE_SCHEDULE_FAILED: 'cashfreeChargeScheduleFailed'
}

const WEB_DOMAINS = {
  FREE_TRIAL_CF: "freetrialnew.alright.watch", // Domain for cashfree
  FREE_TRIAL: "freetrial.alright.watch"
}

module.exports = {
  CONTENT_STATUS,
  SUBSCRIPTION_TYPES,
  CAMPAIGN_TYPES,
  CAMPAIGN_TARGET_LEVELS,
  CAMPAIGN_EVENT_TYPES,
  CASHFREE_PAYMENT_TYPE,
  CASHFREE_PLAN_TYPE,
  UPI_APPS,
  SUBSCRIPTION_AUTH_STATUS,
  MOENGAGE_EVENTS,
  WEB_DOMAINS
};