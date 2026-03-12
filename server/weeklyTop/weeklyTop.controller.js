const Movie = require("../movie/movie.model");
const Episode = require("../episode/episode.model");
const ViewedContent = require("./viewedContent.model");

exports.topMovies = async (req, res) => {
  const { type } = req.query;

  try {
    if (type) {
      if (type === "MOVIE") {
        matchQuery.type = "movie";
      }
      if (type === "WEB-SERIES") {
        matchQuery.type = "episode";
      }
    }

    // const list = await Movie.find(matchQuery).sort({ view: -1 }).limit(10);

    const list = await Movie.aggregate([
      ...blockCountryWise(req?.user?.country),
      {
        $match: matchQuery,
      },
      ...populateGenre,
      ...populateLanguage,
      ...populateRegion,
      ...populateSubtitle,
      ...populateTrailers,
      {
        $sort: {
          view: -1,
        },
      },
      {
        $limit: 10,
      },
    ]);

    return res.status(200).json({ status: true, message: "Success!", list });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};
