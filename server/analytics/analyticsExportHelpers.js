const Analytics = require("./analytics.model");
const User = require("../user/user.model");
const Transaction = require("../subscription/transaction.model");

/**
 * When true, apply all filters (search, subFilters, contentFilters, regFilters, overviewFilters) to export data.
 * When false, only date filter (startDate/endDate) is applied.
 * Override via env: EXPORT_APPLY_FILTERS=true|false
 */
const APPLY_FILTERS_TO_EXPORT = true;

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
  const listQuery = { ...matchFilter, status: { $nin: ["paid", "active"] } };
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
      { email: { $regex: s, $options: "i" } },
      { sessionId: { $regex: s, $options: "i" } },
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
        d.planId && (d.planId.name || d.planId.tag)
          ? d.planId.name || d.planId.tag
          : d.planType || null;
      return f.planTypes.includes(plan);
    });
  }
  if (typeof f.emailSearch === "string" && f.emailSearch.trim()) {
    const q = f.emailSearch.toLowerCase().trim();
    result = result.filter((d) => (d.userId?.email || "").toLowerCase().includes(q));
  }
  if (Array.isArray(f.currencies) && f.currencies.length) {
    result = result.filter((d) =>
      f.currencies.includes((d.currency || "").toUpperCase())
    );
  }
  if (f.amount != null && f.amount !== "") {
    const val = Number(f.amount);
    if (!Number.isNaN(val)) result = result.filter((d) => (d.amount_total ?? 0) === val);
  }
  if (f.amountMin != null && f.amountMin !== "") {
    const min = Number(f.amountMin);
    if (!Number.isNaN(min)) result = result.filter((d) => (d.amount_total ?? 0) >= min);
  }
  if (f.amountMax != null && f.amountMax !== "") {
    const max = Number(f.amountMax);
    if (!Number.isNaN(max)) result = result.filter((d) => (d.amount_total ?? 0) <= max);
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
  if (f.minViews != null && f.minViews !== "") {
    const min = Number(f.minViews);
    if (!Number.isNaN(min)) result = result.filter((d) => (d.thumbnailViews ?? 0) >= min);
  }
  if (f.minClicks != null && f.minClicks !== "") {
    const min = Number(f.minClicks);
    if (!Number.isNaN(min)) result = result.filter((d) => (d.thumbnailClicks ?? 0) >= min);
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
  if (Array.isArray(f.planTypes) && f.planTypes.length) {
    result = result.filter((d) => f.planTypes.includes(d.planType || ""));
  }
  if (typeof f.emailSearch === "string" && f.emailSearch.trim()) {
    const q = f.emailSearch.toLowerCase().trim();
    result = result.filter((d) => (d.email || "").toLowerCase().includes(q));
  }
  return result;
}

/**
 * Apply overview filters (event types to include, or eventTypeSearch substring)
 */
function applyOverviewFilters(data, overviewFilters) {
  const f = overviewFilters || {};
  let result = data;
  if (Array.isArray(f.eventTypes) && f.eventTypes.length) {
    const eventSet = new Set(f.eventTypes);
    result = result.filter((d) => eventSet.has(d._id || d.eventType));
  }
  if (typeof f.eventTypeSearch === "string" && f.eventTypeSearch.trim()) {
    const q = f.eventTypeSearch.toLowerCase().trim();
    result = result.filter((d) =>
      String(d._id || d.eventType || "").toLowerCase().includes(q)
    );
  }
  if (f.totalCountMin != null && f.totalCountMin !== "") {
    const min = Number(f.totalCountMin);
    if (!Number.isNaN(min)) result = result.filter((d) => (d.totalCount ?? 0) >= min);
  }
  return result;
}

// --- Table data fetchers ---

async function fetchOverviewData(dateFilterAnalytics, overviewFilters, sort) {
  const data = await Analytics.aggregate([
    { $match: dateFilterAnalytics },
    { $group: { _id: "$eventType", totalCount: { $sum: "$count" } } },
    { $sort: { totalCount: -1 } },
  ]);
  let filtered = applyOverviewFilters(data, overviewFilters);
  filtered = applySortToData(filtered, sort, { eventType: "_id" });
  return {
    title: "Event Distribution",
    headers: ["Event Type", "Total Count"],
    rows: filtered.map((d) => [
      (d._id || "").replace(/_/g, " "),
      String(d.totalCount || 0),
    ]),
  };
}

async function fetchContentData(dateFilterAnalytics, contentFilters, sort) {
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
  let filtered = applyContentFilters(data, contentFilters);
  filtered = applySortToData(filtered, sort || []);
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

function getSubscriptionSortVal(d, id) {
  if (id === "createdAt") return d.createdAt ? new Date(d.createdAt).getTime() : 0;
  if (id === "email") return d.email || d.userId?.email || "";
  if (id === "country") return d.country || d.userId?.country || "";
  if (id === "planType") return d.planType || d.planId?.name || d.planId?.tag || "";
  if (id === "status") return d.status ?? "";
  if (id === "amount_total") return d.amount_total ?? 0;
  if (id === "currency") return (d.currency || "").toUpperCase();
  return d[id];
}

async function fetchSubscriptionsData(matchFilter, subFilters, sort) {
  let data = await Transaction.find(matchFilter)
    .populate("userId", "fullName email country")
    .populate("planId", "name tag")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();
  data = applySubscriptionFilters(data, subFilters);
  data = applySortToData(data, sort || [], null, getSubscriptionSortVal);
  return {
    title: "Subscription Transactions",
    headers: ["Date", "Email", "Country", "Plan", "Status", "Amount", "Currency"],
    rows: data.map((d) => [
      d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "-",
      d.email || d.userId?.email || "-",
      d.country || d.userId?.country || "-",
      d.planType || d.planId?.name || d.planId?.tag || "-",
      d.status || "-",
      String(d.amount_total ?? 0),
      (d.currency || "").toUpperCase(),
    ]),
  };
}

/**
 * Apply payment filters (status, country, plan, email, userName)
 */
function applyPaymentFilters(data, paymentFilters) {
  const f = paymentFilters || {};
  let result = data;
  if (Array.isArray(f.statuses) && f.statuses.length) {
    result = result.filter((d) => f.statuses.includes(d.status));
  }
  if (Array.isArray(f.countries) && f.countries.length) {
    result = result.filter((d) =>
      f.countries.includes(d.userId?.country || "Unknown")
    );
  }
  if (Array.isArray(f.planNames) && f.planNames.length) {
    result = result.filter((d) => {
      const plan =
        d.premiumPlanId &&
        (d.premiumPlanId.name || d.premiumPlanId.heading || d.premiumPlanId.tag)
          ? d.premiumPlanId.name || d.premiumPlanId.heading || d.premiumPlanId.tag
          : null;
      return f.planNames.includes(plan);
    });
  }
  if (typeof f.emailSearch === "string" && f.emailSearch.trim()) {
    const q = f.emailSearch.toLowerCase().trim();
    result = result.filter((d) =>
      (d.userId?.email || "").toLowerCase().includes(q)
    );
  }
  if (typeof f.userNameSearch === "string" && f.userNameSearch.trim()) {
    const q = f.userNameSearch.toLowerCase().trim();
    result = result.filter((d) =>
      (d.userId?.fullName || "").toLowerCase().includes(q)
    );
  }
  if (f.amountMin != null && f.amountMin !== "") {
    const min = Number(f.amountMin);
    if (!Number.isNaN(min)) result = result.filter((d) => (d.amount_total ?? 0) >= min);
  }
  if (f.amountMax != null && f.amountMax !== "") {
    const max = Number(f.amountMax);
    if (!Number.isNaN(max)) result = result.filter((d) => (d.amount_total ?? 0) <= max);
  }
  return result;
}

function getPaymentSortVal(d, id) {
  if (id === "createdAt") return d.createdAt ? new Date(d.createdAt).getTime() : 0;
  if (id === "email") return (d.email || d.userId?.email) ?? "";
  if (id === "userName") return (d.customer_name || d.userId?.fullName) ?? "";
  if (id === "country") return (d.country || d.userId?.country) ?? "";
  if (id === "planName") return d.planType || d.planId?.name || d.planId?.tag || "";
  if (id === "status") return d.status ?? "";
  if (id === "amount_total") return d.amount_total ?? 0;
  return d[id];
}

async function fetchPaymentsData(matchFilter, search, paymentFilters, sort) {
  const listQuery = await buildIncompletePaymentsQuery(matchFilter, search);
  let data = await Transaction.find(listQuery)
    .populate("userId", "fullName email country")
    .populate("planId", "name tag")
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();
  data = applyPaymentFilters(data, paymentFilters);
  data = applySortToData(data, sort || [], null, getPaymentSortVal);
  return {
    title: "Failed / Pending Payments",
    headers: ["Initiated At", "User Email", "User Name", "Country", "Plan", "Status", "Amount"],
    rows: data.map((d) => [
      d.createdAt ? new Date(d.createdAt).toLocaleString() : "-",
      d.email || d.userId?.email || "-",
      (d.customer_name || d.userId?.fullName || "").replace(/"/g, '""'),
      d.country || d.userId?.country || "-",
      d.planType || d.planId?.name || d.planId?.tag || "-",
      d.status || "-",
      String(d.amount_total ?? 0),
    ]),
  };
}

async function fetchRegistrationsData(matchFilter, regFilters, sort) {
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

  let filtered = applyRegistrationFilters(data, regFilters);
  filtered = applySortToData(filtered, sort || []);
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
 * Apply or strip non-date filters based on APPLY_FILTERS_TO_EXPORT flag
 */
function resolveFiltersForExport(filters) {
  if (!APPLY_FILTERS_TO_EXPORT) {
    return {
      matchFilter: filters.matchFilter,
      dateFilterAnalytics: filters.dateFilterAnalytics,
      search: null,
      subFilters: null,
      contentFilters: null,
      regFilters: null,
      overviewFilters: null,
      paymentFilters: null,
      sort: filters.sort || [],
    };
  }
  return filters;
}

/**
 * Apply sort to data array before building rows
 * @param {Array} data - raw data
 * @param {Array} sort - [{ id: string, desc: boolean }]
 * @param {Object} fieldMap - map column id to data field (e.g. { eventType: "_id" })
 * @param {Function} getValue - optional (row, fieldId) => value for custom access
 */
function applySortToData(data, sort, fieldMap = {}, getValue) {
  if (!Array.isArray(sort) || !sort.length) return data;
  const arr = [...data];
  const get = getValue
    ? (row, id) => getValue(row, id)
    : (row, id) => {
        const field = (fieldMap || {})[id] || id;
        return row[field] ?? row[id];
      };
  arr.sort((a, b) => {
    for (const s of sort) {
      const aVal = get(a, s.id);
      const bVal = get(b, s.id);
      const cmp =
        aVal == null && bVal == null ? 0 :
        aVal == null ? 1 : bVal == null ? -1 :
        typeof aVal === "number" && typeof bVal === "number" ? aVal - bVal :
        String(aVal).localeCompare(String(bVal));

      if (cmp !== 0) return s.desc ? -cmp : cmp;
    }
    return 0;
  });
  return arr;
}

/**
 * Fetch table data for export based on tableType and filters
 */
async function fetchTableDataForExport(tableType, filters) {
  const resolved = resolveFiltersForExport(filters);
  const { matchFilter, dateFilterAnalytics } = resolved;

  const sort = resolved.sort || [];

  switch (tableType) {
    case "overview":
      return fetchOverviewData(dateFilterAnalytics, resolved.overviewFilters, sort);
    case "content":
      return fetchContentData(dateFilterAnalytics, resolved.contentFilters, sort);
    case "subscriptions":
      return fetchSubscriptionsData(matchFilter, resolved.subFilters, sort);
    case "payments":
      return fetchPaymentsData(matchFilter, resolved.search, resolved.paymentFilters, sort);
    case "registrations":
      return fetchRegistrationsData(matchFilter, resolved.regFilters, sort);
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
  resolveFiltersForExport,
  fetchTableDataForExport,
  buildCsvContent,
  buildPdfBuffer,
  buildExportEmailHtml,
  getTableTitle,
  TABLE_TYPE_LABELS,
  APPLY_FILTERS_TO_EXPORT,
};
