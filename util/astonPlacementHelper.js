/**
 * Process campaigns for aston placements with dynamic trigger time calculation
 * Business Rules:
 * 1. Only include placements of type "ASTON" (case-insensitive)
 * 2. Sort campaigns by priority (ascending - lower number = higher priority)
 * 3. Select top N campaigns based on runtime:
 *    - < 45s: 1 placement
 *    - < 90s: 2 placements
 *    - >= 90s: 3 placements
 * 4. Calculate evenly distributed trigger times: triggerTime = (runtime / (N + 1)) * index
 * 
 * Note: Each campaign can only have one placement of type "aston" per the schema validation,
 * so we don't need to enforce unique placement types within a campaign.
 * 
 * @param {Array} campaigns - Array of campaign objects with placements
 * @param {Number} runtimeInSeconds - Episode runtime in seconds
 * @returns {Array} - Processed campaigns with calculated trigger times
 */
const processAstonCampaigns = (campaigns, runtimeInSeconds) => {
  if (!campaigns || campaigns.length === 0) {
    return [];
  }

  // If runtime is 0 or undefined, default to 60 seconds for calculation
  const runtime = runtimeInSeconds || 60;

  // Step 1: Filter campaigns to only include those with "aston" placements
  // Note: placement.type can be 'ASTON', 'aston', etc. - normalize for comparison
  const campaignsWithAstonPlacements = campaigns
    .map(campaign => {
      // Filter placements to only "aston" type (case-insensitive)
      const astonPlacements = (campaign.placements || []).filter(
        placement => placement.type && placement.type.toUpperCase() === 'ASTON'
      );

      if (astonPlacements.length === 0) {
        return null;
      }

      // Return campaign with only aston placements
      return {
        ...campaign,
        placements: astonPlacements
      };
    })
    .filter(campaign => campaign !== null);

  if (campaignsWithAstonPlacements.length === 0) {
    return [];
  }

  // Step 2: Sort campaigns by priority (ascending - lower number = higher priority)
  const sortedCampaigns = campaignsWithAstonPlacements.sort(
    (a, b) => (a.priority || 0) - (b.priority || 0)
  );

  // Step 3: Determine number of aston placements based on runtime
  let maxPlacements;
  if (runtime < 45) {
    maxPlacements = 1;
  } else if (runtime < 90) {
    maxPlacements = 2;
  } else {
    maxPlacements = 3;
  }

  // Step 4: Select top N campaigns
  const selectedCampaigns = sortedCampaigns.slice(0, maxPlacements);

  // Step 5: Calculate evenly distributed trigger times
  // Formula: triggerTime = (runtime / (N + 1)) * index (where index starts from 1)
  const processedCampaigns = selectedCampaigns.map((campaign, index) => {
    const triggerTime = Math.floor((runtime / (maxPlacements + 1)) * (index + 1));

    // Process each aston placement and set the calculated trigger time
    const processedPlacements = campaign.placements.map(placement => ({
      type: placement.type,
      title: placement.title,
      subtitle: placement.subtitle || null,
      description: placement.description || null,
      ctaText: placement.ctaText || null,
      ctaColor: placement.ctaColor || null,
      displayDurationSec: placement.displayDurationSec,
      triggerTime // Override with calculated trigger time
    }));

    return {
      _id: campaign._id,
      brandId: campaign.brandId,
      campaignName: campaign.campaignName,
      campaignURL: campaign.campaignURL,
      brandLogoUrl: campaign.brandLogoUrl,
      priority: campaign.priority,
      placements: processedPlacements
    };
  });

  return processedCampaigns;
};

module.exports = { processAstonCampaigns };