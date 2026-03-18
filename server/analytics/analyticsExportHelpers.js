const Analytics = require("./analytics.model");
const User = require("../user/user.model");
const PremiumPlanHistory = require("../premiumPlan/premiumPlanHistory.model");

// --- Date filter helpers (reused across export & API) ---

/**
 * Build date query and match filters from startDate/endDate
 * @returns {{ dateQuery: object, matchFilter: object, dateFilterAnalytics: object }}
 */
function buildDateFilters(startDate, endDate) {
  const dateQuery = {};
  if (startDate) dateQuery.$gte = new Date(startDate);
  if (endDate) {
    const d = new Date(endDate);
    d.setHours(23, 59, 59, 999);
    dateQuery.$lte = d;
  }
  const hasDateFilter = Object.keys(dateQuery).length > 0;
  return {
    dateQuery,
    matchFilter: hasDateFilter ? { createdAt: dateQuery } : {},
    dateFilterAnalytics: hasDateFilter ? { date: dateQuery } : {},
  };
}

/**
 * Build query for incomplete payments (same as getIncompletePayments API)
 */
async function buildIncompletePaymentsQuery(matchFilter, search) {
  const listQuery = { ...matchFilter, status: { $ne: "active" } };
  if (typeof search === "string" && search.trim()) {
    const s = search.trim();
    const users = await User.find({
      $or: [
        { email: { $regex: s, $options: "i" } },
        { fullName: { $regex: s, $options: "i" } },
      ],
    }).select("_id");
    const userIds = users.map((u) => u._id);
    listQuery.$or = [
      { userId: { $in: userIds } },
      { transactionId: { $regex: s, $options: "i" } },
    ];
  }
  return listQuery;
}

/**
 * Apply subscription filters (same as PlatformAnalytics filteredSubscriptions)
 */
function applySubscriptionFilters(data, subFilters) {
  const f = subFilters || {};
  let result = data;

  if (Array.isArray(f.countries) && f.countries.length) {
    result = result.filter((d) => f.countries.includes(d.userId?.country || "Unknown"));
  }
  if (Array.isArray(f.statuses) && f.statuses.length) {
    result = result.filter((d) => f.statuses.includes(d.status));
  }
  if (Array.isArray(f.planTypes) && f.planTypes.length) {
    result = result.filter((d) => {
      const plan =
        d.premiumPlanId && (d.premiumPlanId.name || d.premiumPlanId.tag)
          ? d.premiumPlanId.name || d.premiumPlanId.tag
          : null;
      return f.planTypes.includes(plan);
    });
  }
  if (typeof f.emailSearch === "string" && f.emailSearch.trim()) {
    const q = f.emailSearch.toLowerCase().trim();
    result = result.filter((d) => (d.userId?.email || "").toLowerCase().includes(q));
  }
  return result;
}

/**
 * Apply content filters (title search - same pattern as other filters)
 */
function applyContentFilters(data, contentFilters) {
  const f = contentFilters || {};
  let result = data;

  if (typeof f.titleSearch === "string" && f.titleSearch.trim()) {
    const q = f.titleSearch.toLowerCase().trim();
    result = result.filter((d) => (d.title || "").toLowerCase().includes(q));
  }
  if (Array.isArray(f.movieIds) && f.movieIds.length) {
    const ids = new Set(f.movieIds.map((id) => String(id)));
    result = result.filter((d) => d._id && ids.has(String(d._id)));
  }
  return result;
}

/**
 * Apply registration filters (countries, planStatuses, emailSearch - same as subFilters pattern)
 */
function applyRegistrationFilters(data, regFilters) {
  const f = regFilters || {};
  let result = data;

  if (Array.isArray(f.countries) && f.countries.length) {
    result = result.filter((d) => f.countries.includes(d.country || "Unknown"));
  }
  if (Array.isArray(f.planStatuses) && f.planStatuses.length) {
    result = result.filter((d) => f.planStatuses.includes(d.planStatus || "free"));
  }
  if (typeof f.emailSearch === "string" && f.emailSearch.trim()) {
    const q = f.emailSearch.toLowerCase().trim();
    result = result.filter((d) => (d.email || "").toLowerCase().includes(q));
  }
  return result;
}

/**
 * Apply overview filters (event types to include)
 */
function applyOverviewFilters(data, overviewFilters) {
  const f = overviewFilters || {};
  if (!Array.isArray(f.eventTypes) || !f.eventTypes.length) return data;
  const eventSet = new Set(f.eventTypes);
  return data.filter((d) => eventSet.has(d._id || d.eventType));
}

// --- Table data fetchers ---

async function fetchOverviewData(dateFilterAnalytics, overviewFilters) {
  const data = await Analytics.aggregate([
    { $match: dateFilterAnalytics },
    { $group: { _id: "$eventType", totalCount: { $sum: "$count" } } },
    { $sort: { totalCount: -1 } },
  ]);
  const filtered = applyOverviewFilters(data, overviewFilters);
  return {
    title: "Event Distribution",
    headers: ["Event Type", "Total Count"],
    rows: filtered.map((d) => [
      (d._id || "").replace(/_/g, " "),
      String(d.totalCount || 0),
    ]),
  };
}

async function fetchContentData(dateFilterAnalytics, contentFilters) {
  const data = await Analytics.aggregate([
    {
      $match: {
        ...dateFilterAnalytics,
        eventType: { $in: ["thumbnail_view", "thumbnail_click"] },
        movieId: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$movieId",
        thumbnailViews: { $sum: { $cond: [{ $eq: ["$eventType", "thumbnail_view"] }, "$count", 0] } },
        thumbnailClicks: { $sum: { $cond: [{ $eq: ["$eventType", "thumbnail_click"] }, "$count", 0] } },
      },
    },
    { $lookup: { from: "movies", localField: "_id", foreignField: "_id", as: "m" } },
    { $unwind: "$m" },
    {
      $project: {
        title: "$m.title",
        thumbnailViews: 1,
        thumbnailClicks: 1,
        ctr: {
          $cond: [
            { $eq: ["$thumbnailViews", 0] },
            0,
            { $multiply: [{ $divide: ["$thumbnailClicks", "$thumbnailViews"] }, 100] },
          ],
        },
      },
    },
    { $sort: { thumbnailViews: -1 } },
    { $limit: 1000 },
  ]);
  const filtered = applyContentFilters(data, contentFilters);
  return {
    title: "Content Performance",
    headers: ["Title", "Views", "Clicks", "CTR %"],
    rows: filtered.map((d) => [
      (d.title || "").replace(/"/g, '""'),
      String(d.thumbnailViews || 0),
      String(d.thumbnailClicks || 0),
      (d.ctr || 0).toFixed(2) + "%",
    ]),
  };
}

async function fetchSubscriptionsData(matchFilter, subFilters) {
  let data = await PremiumPlanHistory.find(matchFilter)
    .populate("userId", "fullName email country")
    .populate("premiumPlanId", "name tag")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();
  data = applySubscriptionFilters(data, subFilters);
  return {
    title: "Subscription Transactions",
    headers: ["Date", "Email", "Country", "Plan", "Status", "Amount", "Currency"],
    rows: data.map((d) => [
      d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "-",
      d.userId?.email || "-",
      d.userId?.country || "-",
      d.premiumPlanId?.name || d.premiumPlanId?.tag || "-",
      d.status || "-",
      String(d.amount ?? 0),
      (d.currency || "").toUpperCase(),
    ]),
  };
}

async function fetchPaymentsData(matchFilter, search) {
  const listQuery = await buildIncompletePaymentsQuery(matchFilter, search);
  const data = await PremiumPlanHistory.find(listQuery)
    .populate("userId", "fullName email country")
    .populate("premiumPlanId", "name heading tag")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();
  return {
    title: "Failed / Pending Payments",
    headers: ["Initiated At", "User Email", "User Name", "Country", "Plan", "Status", "Amount"],
    rows: data.map((d) => [
      d.createdAt ? new Date(d.createdAt).toLocaleString() : "-",
      d.userId?.email || "-",
      (d.userId?.fullName || "").replace(/"/g, '""'),
      d.userId?.country || "-",
      d.premiumPlanId?.name || d.premiumPlanId?.heading || d.premiumPlanId?.tag || "-",
      d.status || "-",
      String(d.amount ?? 0),
    ]),
  };
}

async function fetchRegistrationsData(matchFilter, regFilters) {
  const users = await User.find(matchFilter)
    .populate("plan.premiumPlanId", "name tag")
    .select("country createdAt email plan isPremiumPlan")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  const now = new Date();
  const data = users.map((user) => {
    const subscriptionExpiry =
      user.plan && user.plan.planEndDate ? new Date(user.plan.planEndDate) : null;
    const isPremium =
      !!user.isPremiumPlan &&
      subscriptionExpiry &&
      subscriptionExpiry.getTime() > now.getTime();
    const planStatus = isPremium ? "premium" : "free";
    const premium = user.plan && user.plan.premiumPlanId;
    const planType =
      premium && (premium.name || premium.tag) ? premium.name || premium.tag : null;
    let subscriptionTimeRemaining = null;
    if (planStatus === "premium" && subscriptionExpiry) {
      const diffMs = subscriptionExpiry.getTime() - now.getTime();
      subscriptionTimeRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    }
    return {
      country: user.country ?? null,
      createdAt: user.createdAt ?? null,
      planType,
      planStatus,
      subscriptionTimeRemaining,
      email: user.email ?? null,
    };
  });

  const filtered = applyRegistrationFilters(data, regFilters);
  return {
    title: "User List & Subscriptions",
    headers: ["Country", "Created At", "Plan Type", "Plan Status", "Subscriptions Time Remaining (days)"],
    rows: filtered.map((d) => [
      d.country || "-",
      d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "-",
      d.planType || "-",
      d.planStatus || "-",
      d.subscriptionTimeRemaining != null ? String(d.subscriptionTimeRemaining) : "-",
    ]),
  };
}

/**
 * Fetch table data for export based on tableType and filters
 */
async function fetchTableDataForExport(tableType, filters) {
  const { matchFilter, dateFilterAnalytics } = filters;

  switch (tableType) {
    case "overview":
      return fetchOverviewData(dateFilterAnalytics, filters.overviewFilters);
    case "content":
      return fetchContentData(dateFilterAnalytics, filters.contentFilters);
    case "subscriptions":
      return fetchSubscriptionsData(matchFilter, filters.subFilters);
    case "payments":
      return fetchPaymentsData(matchFilter, filters.search);
    case "registrations":
      return fetchRegistrationsData(matchFilter, filters.regFilters);
    default:
      throw new Error(`Unknown tableType: ${tableType}`);
  }
}

// --- File generation helpers ---

function escapeCsvCell(cell) {
  return `"${String(cell).replace(/"/g, '""')}"`;
}

function buildCsvContent(title, headers, rows, periodNote) {
  let content = `${title}${periodNote}\nGenerated: ${new Date().toLocaleString()}\n\n`;
  content += headers.join(",") + "\n";
  rows.forEach((r) => {
    content += r.map(escapeCsvCell).join(",") + "\n";
  });
  return content;
}

async function buildPdfBuffer(title, headers, rows, periodNote) {
  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const bufferPromise = new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const startX = 40;
  const colW = 75;
  const rowHeight = 18;

  doc.fontSize(18).text(title + periodNote, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.moveDown(1);

  let y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9);
  headers.forEach((h, i) => {
    doc.text(String(h).substring(0, 25), startX + i * colW, y, { width: colW });
  });
  y += rowHeight;
  doc.font("Helvetica").fontSize(8);

  rows.forEach((row) => {
    if (y > 700) {
      doc.addPage();
      y = 40;
    }
    row.forEach((cell, i) => {
      doc.text(String(cell).substring(0, 25), startX + i * colW, y, { width: colW });
    });
    y += rowHeight;
  });

  doc.end();
  return bufferPromise;
}

// --- Email helpers ---

const TABLE_TYPE_LABELS = {
  overview: "Event Distribution",
  content: "Content Performance",
  subscriptions: "Subscription Transactions",
  payments: "Failed / Pending Payments",
  registrations: "User List & Subscriptions",
};

function buildExportEmailHtml(title, cdnUrl, formatLabel, periodNote = "") {
  return `
    <div style="font-family: sans-serif; color: #333; max-width: 600px;">
      <h2 style="color: #26B7C1;">${title} Export Ready</h2>
      <p>Hello,</p>
      <p>Your requested export of the <b>${title}</b> table${periodNote} in ${formatLabel} format has been generated.</p>
      <div style="margin: 30px 0;">
        <a href="${cdnUrl}" style="background-color: #26B7C1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: 700;">Download ${formatLabel}</a>
      </div>
      <p style="font-size: 12px; color: #999;">This is an automated message from Netcliff Admin System.</p>
    </div>
  `;
}

function getTableTitle(tableType) {
  return TABLE_TYPE_LABELS[tableType] || tableType;
}

module.exports = {
  buildDateFilters,
  buildIncompletePaymentsQuery,
  applySubscriptionFilters,
  applyContentFilters,
  applyRegistrationFilters,
  applyOverviewFilters,
  fetchTableDataForExport,
  buildCsvContent,
  buildPdfBuffer,
  buildExportEmailHtml,
  getTableTitle,
  TABLE_TYPE_LABELS,
};
