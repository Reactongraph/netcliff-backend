const { GrowthBookClient } = require("@growthbook/growthbook");

let gbClient;

async function initGrowthBook() {
  gbClient = new GrowthBookClient({
    apiHost: "https://cdn.growthbook.io",
    clientKey: process.env.GROWTHBOOK_CLIENT_KEY,
    environment: process.env.GROWTHBOOK_ENV,
    refreshInterval: 300
  });

  await gbClient.init({ timeout: 3000 });

  // 🔁 Manual safety refresh every 5 min
  setInterval(async () => {
    try {
      await gbClient.refreshFeatures();
    } catch (e) {
      console.error("GrowthBook refresh failed", e);
    }
  }, 5 * 60 * 1000);

  console.log("GrowthBook initialized");
  return gbClient;
}

function getGrowthBookClient() {
  if (!gbClient) {
    throw new Error("GrowthBook not initialized");
  }
  return gbClient;
}

module.exports = {
  initGrowthBook,
  getGrowthBookClient,
};
