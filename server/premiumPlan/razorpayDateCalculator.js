// Reusable Razorpay date calculation utility
const calculateRazorpayPlanDates = (subscription, premiumPlan, context = 'createHistory') => {
  let planStartDate, planEndDate;

  // For free trials (with paid_count = 0), always start immediately
  if (subscription.notes?.isFreeTrial && subscription.paid_count === 0) {
    planStartDate = new Date();
  } else {
    // For paid subscriptions, use subscription timestamps or current time
    if (subscription.current_start || subscription.start_at) {
      planStartDate = new Date((subscription.current_start || subscription.start_at) * 1000);
    } else {
      planStartDate = new Date();
    }
  }

  // Primary method: Use subscription current_end if available
  if (subscription.current_end) {
    planEndDate = new Date(subscription.current_end * 1000);

    // Special case: Free trials end at start date (immediate expiry)
    if (subscription.notes?.isFreeTrial && subscription.paid_count === 0) {
      if (subscription.current_start || subscription.start_at)
        planEndDate = new Date((subscription.current_start || subscription.start_at) * 1000);
      else {
        // Free trial duration from global settings
        const setting = global.settingJSON;
        const freeTrialDays = setting?.paymentProviderFreeTrialDays || 0;
        planEndDate.setDate(planStartDate.getDate() + freeTrialDays);
      }
    }
  } else {
    // Fallback: Calculate based on plan validity
    planEndDate = new Date(planStartDate);

    if (subscription.notes?.isFreeTrial && subscription.paid_count === 0) {
      // Free trial duration from global settings
      const setting = global.settingJSON;
      const freeTrialDays = setting?.paymentProviderFreeTrialDays || 0;
      planEndDate.setDate(planStartDate.getDate() + freeTrialDays);
    } else if (premiumPlan) {
      // Calculate based on premium plan validity
      if (premiumPlan.validityType === "month") {
        planEndDate.setMonth(planStartDate.getMonth() + premiumPlan.validity);
      } else if (premiumPlan.validityType === "year") {
        planEndDate.setFullYear(planStartDate.getFullYear() + premiumPlan.validity);
      } else {
        // Default fallback: 1 month
        planEndDate.setMonth(planStartDate.getMonth() + 1);
      }
    }
  }

  // Add extra time buffer for all type end dates
  const extraMinutes = parseInt(process.env.RAZORPAY_END_DATE_BUFFER_MINUTES) || 90;
  planEndDate.setMinutes(planEndDate.getMinutes() + extraMinutes);

  return { planStartDate, planEndDate };
};

// Specialized function for renewal scenarios (subscription.charged)
const calculateRazorpayRenewalDates = (subscription) => {
  const planEndDate = new Date(subscription.current_end * 1000);

  // Add extra time buffer (default 1.5 hours)
  const extraMinutes = parseInt(process.env.RAZORPAY_END_DATE_BUFFER_MINUTES) || 90;
  planEndDate.setMinutes(planEndDate.getMinutes() + extraMinutes);

  return {
    planStartDate: new Date(subscription.current_start * 1000),
    planEndDate: planEndDate
  };
};

// Reusable Razorpay date calculation utility
const calculateRazorpayPlanDatesV2 = (subscription, premiumPlan, context = 'createHistory') => {
  let planStartDate, planEndDate;

  // For free trials (with paid_count = 0), always start immediately
  if (subscription.notes?.isFreeTrial && subscription.paid_count === 0) {
    planStartDate = new Date();
  } else {
    // For paid subscriptions, use subscription timestamps or current time
    if (subscription.current_start || subscription.start_at) {
      planStartDate = new Date((subscription.current_start || subscription.start_at) * 1000);
    } else {
      planStartDate = new Date();
    }
  }

  // Primary method: Use subscription current_end if available
  if (subscription.current_end) {
    planEndDate = new Date(subscription.current_end * 1000);

    // Special case: Free trials end at start date (immediate expiry)
    if (subscription.notes?.isFreeTrial && subscription.paid_count === 0) {
      if (subscription.current_start || subscription.start_at)
        planEndDate = new Date((subscription.current_start || subscription.start_at) * 1000);
      else {
        const freeTrialDays = getFreeTrialDays(premiumPlan);
        planEndDate.setDate(planStartDate.getDate() + freeTrialDays);
      }
    }
  } else {
    // Fallback: Calculate based on plan validity
    planEndDate = new Date(planStartDate);

    if (subscription.notes?.isFreeTrial && subscription.paid_count === 0) {
      // Free trial duration from global settings
      const freeTrialDays = getFreeTrialDays(premiumPlan);
      planEndDate.setDate(planStartDate.getDate() + freeTrialDays);
    } else if (premiumPlan) {
      // Calculate based on premium plan validity
      if (premiumPlan.validityType === "month") {
        planEndDate.setMonth(planStartDate.getMonth() + premiumPlan.validity);
      } else if (premiumPlan.validityType === "year") {
        planEndDate.setFullYear(planStartDate.getFullYear() + premiumPlan.validity);
      } else {
        // Default fallback: 1 month
        planEndDate.setMonth(planStartDate.getMonth() + 1);
      }
    }
  }

  // Add extra time buffer for all type end dates
  const extraMinutes = parseInt(process.env.RAZORPAY_END_DATE_BUFFER_MINUTES) || 90;
  planEndDate.setMinutes(planEndDate.getMinutes() + extraMinutes);

  return { planStartDate, planEndDate };
};

const getFreeTrialDays = (premiumPlan) => {
  const setting = global.settingJSON;
  return premiumPlan?.freeTrialDays || setting?.paymentProviderFreeTrialDays || 0;
};

module.exports = {
  calculateRazorpayPlanDates,
  calculateRazorpayRenewalDates,
  calculateRazorpayPlanDatesV2
};