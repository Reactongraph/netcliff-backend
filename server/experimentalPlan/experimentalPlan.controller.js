const dayjs = require("dayjs");
// const { getGrowthBookClient } = require("../../config/growthbook");
const CustomPage = require("../customPage/customPage.model");
const ExperimentalPlanExposure = require("./experimentalPlanExposure.model");
const PremiumPlan = require("../premiumPlan/premiumPlan.model");
const Setting = require("../setting/setting.model");

const fetchCustomPage = async (planId) => {
  const res = await CustomPage.findOne({
    type: "paymentPlan",
    planId,
  })
    .populate("planId")
    .lean();

  return res;
};

const fetchDefaultPlan = async () => {
  const res = await PremiumPlan.findOne({
    isDefaultPlan: true,
  });

  return res;
};

/* Uncomment the below code when growthbook is used */
/*
const getConfigDetailsFromGrowthbook = ({ userId, configId, trialConfigId }) => {
  const gbClient = getGrowthBookClient();
  const attr = {
    ...(userId ? { id: userId } : {}),
    ...(configId ? { configId } : {}),
    ...(trialConfigId ? { trialConfigId } : {}),
    platform: "android",
    ts: Date.now(),
  };
  const userContext = {
    attributes: attr,
  };

  // (NOTE: if default served value in growthbook is null, then it will treat feature as Off until it matches any rule)
  let pricefeatureValue = null;
  if (gbClient.isOn("subscription_pricing_v1", userContext)) {
    pricefeatureValue = gbClient.getFeatureValue(
      "subscription_pricing_v1",
      null,
      userContext,
    );
  }

  let trialFeatureValue = null;
  //trial days feature
  if (gbClient.isOn("trial_duration_days_v1", userContext)) {
    trialFeatureValue = gbClient.getFeatureValue(
      "trial_duration_days_v1",
      null,
      userContext,
    );
  }

  return { pricefeatureValue, trialFeatureValue };
};
*/

const parseConfigId = (configId = "") => {
  const id = configId.toLowerCase();

  const match = id.match(/^(\d+)([ymd]?)(\d+)$/);

  if (!match) {
    throw new Error("Invalid configId format");
  }

  const [, validity, type, price] = match;

  const typeMap = {
    y: "year",
    m: "month",
    d: "day",
  };

  const validityType = typeMap[type] || "month";

  return {
    validityType,
    validity: Number(validity),
    price: Number(price),
  };
};

const parseTrialConfigId = (trialConfigId = "") => {
  const id = trialConfigId.toLowerCase();
  return id.endsWith("t") ? Number(id.slice(0, -1)) : null;
};


const getConfigDetails = ({ userId, configId, trialConfigId }) => {
  let pricefeatureValue = parseConfigId(configId);
  let trialFeatureValue = parseTrialConfigId(trialConfigId);    
  return { pricefeatureValue, trialFeatureValue };
};

exports.getExperimentalPlanDetails = async (req, res) => {
  try {
    const setting = global.settingJSON;
    const userId = req.user?.userId;;
    const configId = req.query?.configId;
    const trialConfigId = req.query?.trialConfigId;
    let result = null;

    const now = dayjs();
    // Check existing exposure
    const exposure = userId
      ? await ExperimentalPlanExposure.findOne({ userId })
      : null;

    // checking if coming from deeplink
    if (configId && trialConfigId) {
      const { pricefeatureValue, trialFeatureValue } = getConfigDetails({
        userId,
        configId,
        trialConfigId,
      });

      let planData = null;
      // Find plan based on feature value
      if (pricefeatureValue) {
        planData = await PremiumPlan.findOne({
          price: pricefeatureValue.price,
          validityType: pricefeatureValue.validityType,
          validity: pricefeatureValue.validity,
          ...(trialFeatureValue ? { freeTrialDays: trialFeatureValue } : {}),
        });
      }

      // Make entry in exposure table only if config from deep link matches any existing plan
      if (planData) {
        if (exposure) {
          // updating exposure table if plan coming from deep link is different than existing exposed plan
          if (exposure.planId !== planData._id) {
            await ExperimentalPlanExposure.updateOne(
              { userId },
              {
                $set: {
                  planId: planData._id,
                  configId,
                  trialConfigId,
                  expiresAt: now
                    .add(setting.userStickynessDays, "day")
                    .toDate(),
                },
              },
            );
          }
        } else if (userId) {
          // Saving exposure for future if user is exposed to deep link
          const planExposure = new ExperimentalPlanExposure({
            userId,
            configId,
            trialConfigId,
            planId: planData._id,
            expiresAt: now.add(setting.userStickynessDays, "day").toDate(),
          });
          await planExposure.save();
        }
      } else {
        planData = await fetchDefaultPlan();
      }

      // Fetch custom page for the plan
      result = await fetchCustomPage(planData._id);
      result.freeTrialDays = result.planId.freeTrialDays;
    } else {
      // Case: when user has already exposed to experiment via deep link
      if (exposure && now.isBefore(dayjs(exposure.expiresAt))) {
        result = await fetchCustomPage(exposure.planId);
        result.freeTrialDays = result.planId?.freeTrialDays;
      } else {
        // Show default plan
        const defaultPlan = await fetchDefaultPlan();
        result = await fetchCustomPage(defaultPlan._id);
        result.freeTrialDays = defaultPlan.freeTrialDays;
      }
    }
    // Not using global setting as we need the latest value without restart server
    if(result){
      const { subscriptionAuthPolling } = await Setting.findOne(
        {},
        { subscriptionAuthPolling: 1, _id: 0 }
      ).lean();
      result.pollingWaitTimeSeconds = subscriptionAuthPolling;
    }

    return res
      .status(200)
      .json({ status: true, message: "Success", data: result });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal Server Error" });
  }
};
