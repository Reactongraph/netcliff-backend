const express = require("express");
const app = express.Router();

//Admin Route
const AdminRoute = require("./server/admin/admin.route");
app.use("/admin", AdminRoute);

//User Route
const UserRoute = require("./server/user/user.route");
app.use("/user", UserRoute);

//Movie Route
const MovieRoute = require("./server/movie/movie.route");
app.use("/movie", MovieRoute);

//Region Route
const RegionRoute = require("./server/region/region.route");
app.use("/region", RegionRoute);

//Continent Region Route
const ContinentRegionRoute = require("./server/continentRegion/continentRegion.route");
app.use("/continentRegion", ContinentRegionRoute);

//Genre Route
const GenreRoute = require("./server/genre/genre.route");
app.use("/genre", GenreRoute);

//Tags Route
const TagsRoute = require("./server/tags/tags.route");
app.use("/tags", TagsRoute);

//Genre Route
const LanguageRoute = require("./server/language/language.route");
app.use("/language", LanguageRoute);

//Favorite Route
const FavoriteRoute = require("./server/favorite/favorite.route");
app.use("/favorite", FavoriteRoute);

//Role Route
const RoleRoute = require("./server/role/role.route");
app.use("/role", RoleRoute);

//Trailer Route
const TrailerRoute = require("./server/trailer/trailer.route");
app.use("/trailer", TrailerRoute);

//Subtitle Route
const SubtitleRoute = require("./server/subtitle/subtitle.route");
app.use("/subtitle", SubtitleRoute);

//Episode route
const EpisodeRoute = require("./server/episode/episode.route");
app.use("/episode", EpisodeRoute);

//Comment route
const CommentRoute = require("./server/comment/comment.route");
app.use("/comment", CommentRoute);

//Like route
const LikeRoute = require("./server/like/like.route");
app.use("/like", LikeRoute);

//PremiumPlan route
const PremiumPlanRoute = require("./server/premiumPlan/premiumPlan.route");
app.use("/premiumPlan", PremiumPlanRoute);

//PremiumPlan route
const RazorpayWebHooksRoute = require("./server/razorpayWebHooks/routes");
app.use("/razorpay", RazorpayWebHooksRoute);

//Cashfree WebHooks route
const CashfreeWebHooksRoute = require("./server/cashfreeWebHooks/routes");
app.use("/cashfree", CashfreeWebHooksRoute);

//Setting route
const SettingRoute = require("./server/setting/setting.route");
app.use("/setting", SettingRoute);

//Notification route
const NotificationRoute = require("./server/notification/notification.route");
app.use("/notification", NotificationRoute);

//Download route
const DownloadRoute = require("./server/download/download.route");
app.use("/download", DownloadRoute);

//Dashboard Route
const DashboardRoute = require("./server/dashboard/dashboard.route");
app.use("/dashboard", DashboardRoute);

//FAQ Route
const FAQRoute = require("./server/FAQ/FAQ.route");
app.use("/FAQ", FAQRoute);

//ContactUs Route
const ContactUsRoute = require("./server/contactUs/contactUs.route");
app.use("/contactUs", ContactUsRoute);

//Rating Route
const RatingRoute = require("./server/rating/rating.route");
app.use("/rate", RatingRoute);

//Season Route
const SeasonRoute = require("./server/season/season.route");
app.use("/season", SeasonRoute);

//Advertisement Route
const AdvertisementRoute = require("./server/advertisement/advertisement.route");
app.use("/advertisement", AdvertisementRoute);

//CountryLiveTV Route
const CountryLiveTVRoute = require("./server/countryLiveTV/countryLiveTV.route");
app.use("/countryLiveTV", CountryLiveTVRoute);

//Stream Route
const StreamRoute = require("./server/stream/stream.route");
app.use("/stream", StreamRoute);

//Flag Route
const FlagRoute = require("./server/flag/flag.route");
app.use("/flag", FlagRoute);

//File Route
const FileRoute = require("./server/file/file.route");
app.use("/file", FileRoute);

//Login Route
const LoginRoute = require("./server/login/login.route");
app.use("/", LoginRoute);

//TicketByUser Route
const TicketByUserRoute = require("./server/ticketByUser/ticketByUser.route");
app.use("/ticketByUser", TicketByUserRoute);

//Tv channels Route
const TvChannelsRoute = require("./server/tvChannels/tvChannels.route");
app.use("/tvChannels", TvChannelsRoute);

const CitiesRoute = require("./server/cities/cities.route");
app.use("/city", CitiesRoute);

const ViewedContentRoute = require("./server/viewedContent/viewedContent.route");
app.use("/viewed-content", ViewedContentRoute);

const ContactQueryRoute = require("./server/contactQuery/contactQuery.route");
app.use("/contact-query", ContactQueryRoute);

const AdBannerRoute = require("./server/adBanner/adBanner.route");
app.use("/ad-banner", AdBannerRoute);

// Widget Route
const WidgetRoute = require("./server/widget/widget.route");
app.use("/widget", WidgetRoute);

// Banner Route
const BannerRoute = require("./server/banner/banner.route");
app.use("/banner", BannerRoute);

// Session Analytics Route
const TvWatchSessionRoutes = require("./server/tvWatchSession/tvWatchSession.route");
app.use("/tv-watch-session", TvWatchSessionRoutes);

// Analytics Route
const AnalyticsRoute = require("./server/analytics/analytics.route");
app.use("/analytics", AnalyticsRoute);

// Recommendation Route
const RecommendationRoute = require("./server/recommendation/recommendation.route");
app.use("/recommendation", RecommendationRoute);

// Badge Route
const BadgeRoute = require("./server/badge/badge.route");
app.use("/badge", BadgeRoute);

// Custom Page Config Route
const CustomPageRoute = require("./server/customPage/customPage.route");
app.use("/custom-page", CustomPageRoute);

const TataPlatRoute = require("./server/tataPlay/tataPlay.route");
app.use("/tataplay", TataPlatRoute);
// Experimental Plan Route
const ExperimentalPlanRoute = require("./server/experimentalPlan/experimentalPlan.route");
app.use("/experimental-plan", ExperimentalPlanRoute);

// OTTplay Route
const OTTPlayRoute = require("./server/ottPlay/ottPlay.route");
app.use("/ott-play", OTTPlayRoute);

// Brand Route
const BrandRoute = require("./server/brand/brand.route");
app.use("/brand", BrandRoute);

// Brand Integration Route
const BrandIntegrationRoute = require("./server/brandIntegration/brandIntegration.route");
app.use("/brand-integration", BrandIntegrationRoute);

// Shop Route
const ShopRoute = require("./server/shop/shop.route");
app.use("/shop", ShopRoute);

// Coupon Route
const CouponRoute = require("./server/coupon/coupon.route");
app.use("/coupon", CouponRoute);

module.exports = app;