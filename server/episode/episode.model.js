const mongoose = require("mongoose");

const EpisodeSchema = new mongoose.Schema(
  {
    name: { type: String },
    episodeNumber: { type: Number },
    image: { type: String },
    link: { type: String },
    videoKey: { type: String },
    videoType: { type: Number }, //0:YoutubeUrl 1:m3u8Url 2:MOV 3:MP4 4:MKV 5:WEBM 6:Embed 7:File 7:File hls
    videoUrl: { type: String, default: "" },
    seasonNumber: { type: Number },
    TmdbMovieId: { type: String },
    runtime: { type: Number, default: 0 },   //seconds

    updateType: { type: Number, default: 0 }, //0:tmdb 1:manual (handle to convert the image)
    convertUpdateType: {
      image: { type: Number, default: 0 },
      videoUrl: { type: Number, default: 0 },
    },

    movie: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
    season: { type: mongoose.Schema.Types.ObjectId, ref: "Season" },
    hlsFileName: { type: String },
    drmEnabled: { type: Boolean, default: true }, // DRM protection flag

    wwprResourceId: { type: String },
    fpResourceId: { type: String },

    view: { type: Number, default: 0 },
    favorite: { type: Number, default: 0 },
    like: { type: Number, default: 0 },
    share: { type: Number, default: 0 }, // New field to track shares

    status: { 
      type: String, 
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT"
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

EpisodeSchema.index({ movie: 1 });
EpisodeSchema.index({ season: 1 });
EpisodeSchema.index({ updatedAt: 1, _id: 1 });

// Pre-find middleware to check for gamification option
EpisodeSchema.pre(['find', 'findOne', 'findById'], function() {
  if (this.options.gamification) {
    this.$__.gamificationEnabled = true;
  }
});

// Pre-aggregate middleware to check for gamification option
EpisodeSchema.pre('aggregate', function() {
  if (this.options.gamification) {
    // Get gamification settings
    const viewMultiplier = global.settingJSON?.viewMultiplier || 1;
    const viewConstant = global.settingJSON?.viewConstant || 0;
    const favoriteMultiplier = global.settingJSON?.favoriteMultiplier || 1;
    const favoriteConstant = global.settingJSON?.favoriteConstant || 0;
    const likeMultiplier = global.settingJSON?.likeMultiplier || 1;
    const likeConstant = global.settingJSON?.likeConstant || 0;
    const shareMultiplier = global.settingJSON?.shareMultiplier || 1;
    const shareConstant = global.settingJSON?.shareConstant || 0;
    
    // Add gamification calculation to the pipeline
    this.pipeline().push({
      $addFields: {
        view: {
          $add: [
            { $multiply: ["$view", viewMultiplier] },
            viewConstant
          ]
        },
        favorite: {
          $add: [
            { $multiply: ["$favorite", favoriteMultiplier] },
            favoriteConstant
          ]
        },
        like: {
          $add: [
            { $multiply: ["$like", likeMultiplier] },
            likeConstant
          ]
        },
        share: {
          $add: [
            { $multiply: ["$share", shareMultiplier] },
            shareConstant
          ]
        }
      }
    });
  }
});

// Virtual for gamified views
EpisodeSchema.virtual('displayedView').get(function() {
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
EpisodeSchema.virtual('displayedFavorite').get(function() {
  try {
    if (this.$__.gamificationEnabled) {
      const favoriteMultiplier = global.settingJSON?.favoriteMultiplier || 1;
      const favoriteConstant = global.settingJSON?.favoriteConstant || 0;
      return (favoriteMultiplier * this.favorite) + favoriteConstant;
    }
    return this.favorite;
  } catch (error) {
    console.error('Error calculating displayedFavorite:', error);
    return this.favorite;
  }
});

// Virtual for gamified likes
EpisodeSchema.virtual('displayedLike').get(function() {
  try {
    if (this.$__.gamificationEnabled) {
      const likeMultiplier = global.settingJSON?.likeMultiplier || 1;
      const likeConstant = global.settingJSON?.likeConstant || 0;
      return (likeMultiplier * this.like) + likeConstant;
    }
    return this.like;
  } catch (error) {
    console.error('Error calculating displayedLike:', error);
    return this.like;
  }
});

// Virtual for gamified shares
EpisodeSchema.virtual('displayedShare').get(function() {
  try {
    if (this.$__.gamificationEnabled) {
      const shareMultiplier = global.settingJSON?.shareMultiplier || 1;
      const shareConstant = global.settingJSON?.shareConstant || 0;
      return (shareMultiplier * this.share) + shareConstant;
    }
    return this.share;
  } catch (error) {
    console.error('Error calculating displayedShare:', error);
    return this.share;
  }
});

// Ensure virtuals are included in JSON
EpisodeSchema.set('toJSON', { virtuals: true });
EpisodeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model("Episode", EpisodeSchema);
