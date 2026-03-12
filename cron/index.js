const { addDataForWeeklyTop10 } = require("./movie.cron");

// Subscription cron has been moved to alright-cron (Azure Functions).
// startCronJobs is kept for compatibility; only movie cron remains here (commented out).

exports.startCronJobs = () => {
  // Weekly top 10 cron (commented out)
  // cron.schedule("0 0 * * 0", addDataForWeeklyTop10, {
  //   timezone: "UTC",
  // });
};
