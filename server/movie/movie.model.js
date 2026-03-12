const mongoose = require("mongoose");

const movieSchema = new mongoose.Schema(
  {
    title: { type: String },
    image: { type: String },
    landscapeImage: { type: String },
    thumbnail: { type: String },
    link: { type: String }, //link or videoURL
    videoKey: { type: String },
    date: String,
    year: { type: String },
    description: { type: String },
    type: { type: String, default: "Premium" }, //Free or Premium
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT"
    },

    region: { type: mongoose.Schema.Types.ObjectId, ref: "Region" },
    genre: [{ type: mongoose.Schema.Types.ObjectId, ref: "Genre" }],
    genres: [{ type: String }],
    tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tags" }],
    rating: { type: mongoose.Schema.Types.ObjectId, ref: "Rating" },

    view: { type: Number, default: 0 },
    comment: { type: Number, default: 0 },
    runtime: { type: Number, default: 0 },

    updateType: { type: Number, default: 0 }, //0:tmdb 1:manual (handle to convert the image)

    convertUpdateType: {
      image: { type: Number, default: 0 },
      landscapeImage: { type: Number, default: 0 },
      thumbnail: { type: Number, default: 0 },
      link: { type: Number, default: 0 },
    },

    //for import the data from TMDB
    TmdbMovieId: { type: String, default: null },
    IMDBid: { type: String, default: null },
    media_type: { type: String }, //movie, tv
    videoType: { type: Number }, //0:YoutubeUrl 1:m3u8Url 2:MOV 3:MP4 4:MKV 5:WEBM 6:Embed 7:File 7:File hls

    language: [{ type: mongoose.Schema.Types.ObjectId, ref: "Language" }],
    maturity: { type: String, enum: ["g", "pg", "pg-13", "16+", "r", "21+"] }, // g,
    videoQuality: {
      type: String,
      enum: ["360p", "480p", "720p", "1080p", "1440p", "4k", "8k"],
    },
    contentRating: {
      type: Number,
    },
    exclusive: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    newReleased: { type: Boolean, default: false },
    isCachedOnHome: { type: Boolean, default: false },
    seoTitle: { type: String },
    seoDescription: { type: String },
    seoTags: [{ type: String }],
    blockedCountries: [{ type: mongoose.Schema.Types.ObjectId, ref: "Region" }],
    hlsFileName: { type: String },
    wwprResourceId: { type: String },
    fpResourceId: { type: String },
    badges: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Badges" }
    ],
    isCronBadge: { type: Boolean, default: false },

    // Published Timestamp
    publishedAt: { type: Date },
    lastPublishedAt: { type: Date },
    // handling GAM ad config
    ads: {
      adEnabled: { type: Boolean, default: true },
      firstAdAfterEpisodes: { type: Number },
      subsequentAdInterval: { type: Number }
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Pre-find middleware to check for gamification option
movieSchema.pre(['find', 'findOne', 'findById'], function () {
  if (this.options.gamification) {
    this.$__.gamificationEnabled = true;
  }
});

// Pre-aggregate middleware to check for gamification option
movieSchema.pre('aggregate', function () {
  if (this.options.gamification) {
    // Get gamification settings
    const viewMultiplier = global.settingJSON?.viewMultiplier || 1;
    const viewConstant = global.settingJSON?.viewConstant || 0;

    // Add gamification calculation to the pipeline
    this.pipeline().push({
      $addFields: {
        view: {
          $add: [
            { $multiply: ["$view", viewMultiplier] },
            viewConstant
          ]
        }
      }
    });
  }
});

// Virtual for gamified views (works with find queries)
movieSchema.virtual('displayedView').get(function () {
  try {
    if (this.$__.gamificationEnabled) {
      const viewMultiplier = global.settingJSON?.viewMultiplier || 1;
      const viewConstant = global.settingJSON?.viewConstant || 0;

      // Apply formula: y = mx + c
      return (viewMultiplier * this.view) + viewConstant;
    }
    return this.view;
  } catch (error) {
    console.error('Error calculating displayedView:', error);
    return this.view;
  }
});

// Virtual for gamified favorites
movieSchema.virtual('displayedFavorite').get(function () {
  try {
    if (this.$__.gamificationEnabled) {
      const favoriteMultiplier = global.settingJSON?.favoriteMultiplier || 1;
      const favoriteConstant = global.settingJSON?.favoriteConstant || 0;

      // Apply formula: y = mx + c
      return (favoriteMultiplier * this.favorite) + favoriteConstant;
    }
    return this.favorite;
  } catch (error) {
    console.error('Error calculating displayedFavorite:', error);
    return this.favorite;
  }
});

// Virtual for gamified likes  
movieSchema.virtual('displayedLike').get(function () {
  try {
    if (this.$__.gamificationEnabled) {
      const likeMultiplier = global.settingJSON?.likeMultiplier || 1;
      const likeConstant = global.settingJSON?.likeConstant || 0;

      // Apply formula: y = mx + c
      return (likeMultiplier * this.like) + likeConstant;
    }
    return this.like;
  } catch (error) {
    console.error('Error calculating displayedLike:', error);
    return this.like;
  }
});

// Ensure virtuals are included in JSON
movieSchema.set('toJSON', { virtuals: true });
movieSchema.set('toObject', { virtuals: true });

movieSchema.index({ region: 1 });
movieSchema.index({ genre: 1 });
movieSchema.index({ tags: 1 });
movieSchema.index({ rating: 1 });
movieSchema.index({ media_type: 1 });
movieSchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model("Movie", movieSchema);
