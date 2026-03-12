const dayjs = require("dayjs");

// Shared: set planEndDate from planStartDate + premiumPlan validity (month/year/day/default 1 month)
const applyPlanValidityToEndDate = (planStartDate, planEndDate, premiumPlan) => {
  if (!planEndDate || !planStartDate) return;
  if (premiumPlan?.validityType === "month") {
    planEndDate.setMonth(planStartDate.getMonth() + (premiumPlan.validity ?? 1));
  } else if (premiumPlan?.validityType === "year") {
    planEndDate.setFullYear(
      planStartDate.getFullYear() + (premiumPlan.validity ?? 1),
    );
  } else if (premiumPlan?.validityType === "day") {
    planEndDate.setDate(planStartDate.getDate() + (premiumPlan.validity ?? 30));
  } else {
    planEndDate.setMonth(planStartDate.getMonth() + 1);
  }
};

// Reusable Cashfree date calculation utility
// overrideStartDate: when provided (e.g. first charge = now), use it as planStartDate and compute planEndDate from it + plan validity
// Reusable Cashfree date calculation utility
const calculateCashfreePlanDates = (
  subscription,
  premiumPlan,
  isAuthCharge,
) => {
  const now = new Date();
  let planStartDate = new Date(now);
  let planEndDate = new Date(now);
  const notes = (subscription && (subscription.subscription_tags || subscription.notes)) || {};
  const isFreeTrial =
    notes.isFreeTrial === "true" || notes.isFreeTrial === true;

  if (isAuthCharge) {
  const setting = global.settingJSON;

  let freeTrialDays =
    premiumPlan?.freeTrialDays ??
    setting?.paymentProviderFreeTrialDays ??
    1;

  const currentHourIST = parseInt(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false
    }).format(new Date()),
    10
  );

  if (currentHourIST >= 21 && freeTrialDays === 1) {
    freeTrialDays = 2;
  }

  planEndDate.setDate(planStartDate.getDate() + freeTrialDays);
} else {
    applyPlanValidityToEndDate(planStartDate, planEndDate, premiumPlan);
  }

  // Add extra time buffer for all type end dates
  // Using same env var for buffer
  const extraMinutes =
    parseInt(process.env.RAZORPAY_END_DATE_BUFFER_MINUTES) || 90;
  planEndDate.setMinutes(planEndDate.getMinutes() + extraMinutes);

  return { planStartDate, planEndDate };
};

const calculateCashfreeRenewalDates = (subscription) => {
  let planStartDate, planEndDate;

  // Use next_schedule_date or cycle dates from Cashfree if available
  const nextDate =
    subscription.next_schedule_date ||
    (subscription.currentCycle && subscription.currentCycle.validTill);
  const startDate =
    subscription.payment_initiated_date ||
    (subscription.currentCycle && subscription.currentCycle.validFrom);

  if (nextDate) {
    planStartDate = new Date(startDate || Date.now());
    planEndDate = new Date(nextDate);
  } else {
    planStartDate = new Date();
    planEndDate = new Date();
  }

  // Add buffer
  const extraMinutes =
    parseInt(process.env.RAZORPAY_END_DATE_BUFFER_MINUTES) || 90;
  planEndDate.setMinutes(planEndDate.getMinutes() + extraMinutes);

  return { planStartDate, planEndDate };
};

const getChargeScheduleDate = (isFirstCharge = false, freeTrialDays = 1) => {
  const now = new Date();

  // Get current IST hour safely
  const hourIST = parseInt(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false
    }).format(now),
    10
  );

  let daysToAdd = freeTrialDays;
  if (isFirstCharge && freeTrialDays <= 1 && hourIST >= 21) {
    daysToAdd = 2;
  } else if (hourIST >= 21) {
    daysToAdd = 2;
  }
  
  const scheduleDate = new Date(now);
  scheduleDate.setDate(scheduleDate.getDate() + daysToAdd);

  return scheduleDate.toISOString();
};

module.exports = {
  calculateCashfreePlanDates,
  calculateCashfreeRenewalDates,
  applyPlanValidityToEndDate,
  getChargeScheduleDate
};
