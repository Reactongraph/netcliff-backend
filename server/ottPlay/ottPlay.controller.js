const mongoose = require("mongoose");
const Genre = require("../genre/genre.model");
const Season = require("../season/season.model");
const Movie = require("../movie/movie.model");
const Episode = require("../episode/episode.model");
const { getFromCache, setCache } = require('../../util/redisUtils');
const { generateHlsSignedUrls } = require('../movie/movie.controller');

// Function for Initial Ingestion
exports.initialIngestion = async (req, res) => {
  try {
    // 🔐 Validation (same pattern as getAll)
    if (!req.query.type || !req.query.start || !req.query.limit) {
      return res.status(200).json({
        status: false,
        message: "Oops! Invalid details."
      });
    }

    const start = parseInt(req.query.start);
    const limit = parseInt(req.query.limit);

    // 🎯 media_type mapping
    let matchQuery = {};
    if (req.query.type === "WEBSERIES") {
      matchQuery.media_type = "tv";
    } else if (req.query.type === "MOVIE") {
      matchQuery.media_type = "movie";
    } else {
      return res.status(200).json({
        status: false,
        message: "Pass Valid Type!!"
      });
    }

    // if (req.query.status) {
    //   matchQuery.status = req.query.status;
    // }
    // Only PUBLISHED & Free movies/series
    matchQuery.status = "PUBLISHED";
    matchQuery.type = "Free";

    // 🔢 Total count
    const totalRecords = await Movie.countDocuments(matchQuery);

    // 🎬 Fetch movies / series
    const movies = await Movie.find(matchQuery)
      .populate("genre")
      .populate("language")
      .sort({ createdAt: -1 })
      .skip((start - 1) * limit)
      .limit(limit)
      .lean();

    // 🎥 Fetch seasons only for tv
    const tvMovieIds = movies
      .filter(m => m.media_type === "tv")
      .map(m => m._id);

    const seasons = await Season.find({
      movie: { $in: tvMovieIds }
    })
    .sort({ seasonNumber: 1 })
    .lean();

    const seasonIds = seasons.map(s => s._id);

    // 📺 Fetch episodes
    const episodes = await Episode.find({
      season: { $in: seasonIds }
    })
    .sort({ episodeNumber: 1 })
    .lean();

    // 🧩 Group episodes by season
    const episodesBySeason = {};
    for (const ep of episodes) {
      const seasonId = ep.season.toString();
      episodesBySeason[seasonId] ??= [];
      episodesBySeason[seasonId].push(ep);
    }

    // 🧩 Group seasons by movie
    const seasonsByMovie = {};
    for (const season of seasons) {
      const movieId = season.movie.toString();
      seasonsByMovie[movieId] ??= [];

      const seasonEpisodes = episodesBySeason[season._id.toString()] || [];

      seasonsByMovie[movieId].push({
        seasonId: season._id,
        seriesId: season.movie,
        // genre: null,       // from movie
        title: null,       // from movie
        // description: null, // from movie
        image: season.image,
        // language: null,    // from movie
        seasonNumber: season.seasonNumber,
        episodeCount: seasonEpisodes.length,
        episodes: seasonEpisodes.map(ep => ({
          episodeId: ep._id,
          seriesId: season.movie,
          seasonId: season._id,
          image: ep.image,
          // language: null,
          // description: null,
          name: ep.name,
          // genre: null,
          runtime: ep.runtime,
          episodeNumber: ep.episodeNumber,
          videoKey: ep.videoKey,
          videoType: ep.videoType,
          videoUrl: ep.videoUrl,
          hlsFileName: ep.hlsFileName
        }))
      });
    }

    // 🏗️ Final response shaping
    const data = movies.map(movie => {
      const response = {
        seriesId: movie._id,
        media_type: movie.media_type,
        genres: movie.genres,
        // genre: movie.genre,
        title: movie.title,
        summary: movie.description,
        boxCoverImageUrl: movie.image,
        thumbnailUrl: movie.thumbnail,
        language: movie.language.map(lang => lang.name),
        // seoTitle: movie.seoTitle,
        // seoDescription: movie.seoDescription,
        // seoTags: movie.seoTags,
        link: movie.link,
        showType: "SERIES",
        ageRating: "U/A 13+",
        seasons: []
      };

      if (movie.media_type === "tv") {
        response.seasons = (seasonsByMovie[movie._id.toString()] || []).map(
          season => ({
            ...season,
            genres: movie.genres,
            title: movie.title,
            summary: movie.description,
            language: movie.language.map(lang => lang.name),
            showType: "SEASON",
            ageRating: "U/A 13+",
            episodes: season.episodes.map(ep => ({
              ...ep,
              genres: movie.genres,
              language: movie.language.map(lang => lang.name),
              summary: movie.description,
              showType: "EPISODE",
              ageRating: "U/A 13+",
            }))
          })
        );
      }

      return response;
    });

    return res.status(200).json({
      status: true,
      message: "Success",
      totalRecords: totalRecords,
      data
    });

  } catch (error) {
    console.error("Initial ingestion error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error"
    });
  }
};

// Function for Incremental Ingestion
exports.incrementalIngestion = async (req, res) => {
  try {
    // 🔐 Validation
    if (!req.query.type || !req.query.start || !req.query.limit || !req.query.since) {
      return res.status(200).json({
        status: false,
        message: "Oops! Invalid details."
      });
    }

    const start = parseInt(req.query.start);
    const limit = parseInt(req.query.limit);
    const since = new Date(req.query.since);

    if (isNaN(since.getTime())) {
      return res.status(200).json({
        status: false,
        message: "Invalid 'since' timestamp."
      });
    }

    // 🎯 media_type mapping
    let mediaType;
    if (req.query.type === "WEBSERIES") {
      mediaType = "tv";
    } else if (req.query.type === "MOVIE") {
      mediaType = "movie";
    } else {
      return res.status(200).json({
        status: false,
        message: "Pass Valid Type!!"
      });
    }

    // ✅ Only PUBLISHED & Free
    const baseMovieQuery = {
      media_type: mediaType,
      status: "PUBLISHED",
      type: "Free"
    };

    // 1️⃣ Movies updated after since
    const updatedMovies = await Movie.find({
      ...baseMovieQuery,
      updatedAt: { $gt: since }
    }).select("_id");

    // 2️⃣ Seasons updated after since
    const updatedSeasons = await Season.find({
      updatedAt: { $gt: since }
    }).select("movie");

    // 3️⃣ Episodes updated after since
    const updatedEpisodes = await Episode.find({
      updatedAt: { $gt: since }
    }).select("movie");

    // 🧠 Collect affected movie IDs
    const affectedMovieIds = new Set();

    updatedMovies.forEach(m => affectedMovieIds.add(m._id.toString()));
    updatedSeasons.forEach(s => affectedMovieIds.add(s.movie.toString()));
    updatedEpisodes.forEach(e => affectedMovieIds.add(e.movie.toString()));

    const movieIdsArray = Array.from(affectedMovieIds);

    if (!movieIdsArray.length) {
      return res.status(200).json({
        status: true,
        message: "Success",
        totalRecords: 0,
        data: []
      });
    }

    // 🔢 Total changed count
    const totalRecords = await Movie.countDocuments({
      _id: { $in: movieIdsArray },
      ...baseMovieQuery
    });

    // 🎬 Fetch affected movies (paginated)
    const movies = await Movie.find({
      _id: { $in: movieIdsArray },
      ...baseMovieQuery
    })
      .populate("genre")
      .populate("language")
      .sort({ updatedAt: -1 })
      .skip((start - 1) * limit)
      .limit(limit)
      .lean();

    // 🎥 Fetch seasons
    const tvMovieIds = movies
      .filter(m => m.media_type === "tv")
      .map(m => m._id);

    const seasons = await Season.find({
      movie: { $in: tvMovieIds }
    })
    .sort({ seasonNumber: 1 })
    .lean();

    const seasonIds = seasons.map(s => s._id);

    // 📺 Fetch episodes
    const episodes = await Episode.find({
      season: { $in: seasonIds }
    })
    .sort({ episodeNumber: 1 })
    .lean();

    // 🧩 Group episodes by season
    const episodesBySeason = {};
    episodes.forEach(ep => {
      const sid = ep.season.toString();
      episodesBySeason[sid] ??= [];
      episodesBySeason[sid].push(ep);
    });

    // 🧩 Group seasons by movie
    const seasonsByMovie = {};
    seasons.forEach(season => {
      const mid = season.movie.toString();
      seasonsByMovie[mid] ??= [];

      const seasonEpisodes = episodesBySeason[season._id.toString()] || [];

      seasonsByMovie[mid].push({
        seasonId: season._id,
        seriesId: season.movie,
        title: null,
        image: season.image,
        seasonNumber: season.seasonNumber,
        episodeCount: seasonEpisodes.length,
        episodes: seasonEpisodes.map(ep => ({
          episodeId: ep._id,
          seriesId: season.movie,
          seasonId: season._id,
          image: ep.image,
          name: ep.name,
          runtime: ep.runtime,
          episodeNumber: ep.episodeNumber,
          videoKey: ep.videoKey,
          videoType: ep.videoType,
          videoUrl: ep.videoUrl,
          hlsFileName: ep.hlsFileName
        }))
      });
    });

    // 🏗️ Response shaping (same as initial ingestion)
    const data = movies.map(movie => {
      const response = {
        seriesId: movie._id,
        media_type: movie.media_type,
        genres: movie.genres,
        title: movie.title,
        summary: movie.description,
        boxCoverImageUrl: movie.image,
        thumbnailUrl: movie.thumbnail,
        language: movie.language.map(l => l.name),
        // seoTitle: movie.seoTitle,
        // seoDescription: movie.seoDescription,
        // seoTags: movie.seoTags,
        link: movie.link,
        showType: "SERIES",
        ageRating: "U/A 13+",
        seasons: []
      };

      if (movie.media_type === "tv") {
        response.seasons = (seasonsByMovie[movie._id.toString()] || []).map(
          season => ({
            ...season,
            genres: movie.genres,
            title: movie.title,
            summary: movie.description,
            language: movie.language.map(l => l.name),
            showType: "SEASON",
            ageRating: "U/A 13+",
            episodes: season.episodes.map(ep => ({
              ...ep,
              genres: movie.genres,
              language: movie.language.map(l => l.name),
              summary: movie.description,
              showType: "EPISODE",
              ageRating: "U/A 13+"
            }))
          })
        );
      }

      return response;
    });

    return res.status(200).json({
      status: true,
      message: "Success",
      since: since.toISOString(),
      updatedRecords: totalRecords,
      data
    });

  } catch (error) {
    console.error("Incremental ingestion error:", error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error"
    });
  }
};

// Function for Stream Data
exports.streamingDataUrls = async (req, res) => {
  const { hlsFiles } = req.body;

  if (!hlsFiles || !Array.isArray(hlsFiles) || hlsFiles.length === 0) {
    return res.status(400).json({
      status: false,
      message: "Please provide an array of HLS file objects with hlsFileName."
    });
  }

  try {

    const processHlsFile = async (file) => {
      const { hlsFileName, drm, hasExpiredLastRequest } = file;

      if (!hlsFileName) {
        return {
          hlsFileName: hlsFileName || 'unknown',
          error: "Missing hlsFileName"
        };
      }

      try {
        // Check cache first
        const cacheKey = `hls:${hlsFileName}:${drm ? 'drm' : 'nodrm'}`;
        const cachedUrls = await getFromCache(cacheKey);

        let result;
        //skip cache if hasExpiredLastRequest is true
        if (cachedUrls && !hasExpiredLastRequest && cachedUrls.expiryAt > Date.now()) {
          result = { ...cachedUrls };
        } else {
          const EXPIRY_MS = 24 * 60 * 60 * 1000; // 1 day
          // Generate fresh signed URLs
          const signedUrls = await generateHlsSignedUrls(hlsFileName, drm === true || false);
          const signedUrlsWithExpiry = {
            ...signedUrls,
            expiryAt: Date.now() + EXPIRY_MS
          };
          await setCache(cacheKey, signedUrlsWithExpiry, EXPIRY_MS / 1000);
          result = signedUrlsWithExpiry;
        //   await setCache(cacheKey, signedUrls, process.env.REDIS_TTL);
        //   result = signedUrls;
        }

        return result;
      } catch (fileError) {
        console.error(`Error processing ${hlsFileName}:`, fileError);
        return { hlsFileName, error: fileError.message };
      }
    };

    const results = await Promise.all(hlsFiles.map(processHlsFile));

    const formattedResults = results.map(item => {
      // if error object, pass it through
      if (item.error) {
        return item;
      }

      return {
        videoUrl: item.signedVideoUrl,
        thumbnailUrl: item.signedThumbnailUrl,
        quality: "720p",
        expiryAt: item.expiryAt,
      };
    });
    res.status(200).json({ status: true, data: formattedResults });

  } catch (error) {
    console.error("Error creating batch signed URLs", error);
    res.status(500).json({
      status: false,
      message: "Internal server error.",
      error: error.message
    });
  }
};
