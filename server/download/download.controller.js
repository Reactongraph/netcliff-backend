const Download = require("./download.model");

//import model
const User = require("../user/user.model");
const Movie = require("../movie/movie.model");
const Episode = require("../episode/episode.model");

//create download movie
exports.store = async (req, res) => {
  try {
    var download;
    if (req.user.userId && req.body.movieId) {
      const user = await User.findById(req.user.userId);

      if (!user) return res.status(200).json({ status: false, message: "User does not found!!" });

      //for movie download
      if (req.body.type === 1) {
        const movie = await Movie.findById(req.body.movieId);

        if (!movie) {
          return res.status(200).json({ status: false, message: "No Movie Was Found!!" });
        }

        const downloadExist = await Download.findOne({
          userId: user._id,
          movieId: movie._id,
        });

        if (downloadExist) {
          return res.status(200).json({
            status: false,
            message: "Movie downloaded already exists!! ",
          });
        }

        download = new Download();

        download.userId = user._id;
        download.movieId = movie._id;
        download.type = req.body.type;

        await download.save();
      }

      //for episode download
      if (req.body.type === 2) {
        const episode = await Episode.findById(req.body.movieId);

        if (!episode) {
          return res.status(200).json({ status: false, message: "No Episode Was Found!!" });
        }

        const downloadExist = await Download.findOne({
          userId: user._id,
          movieId: episode._id,
        });

        if (downloadExist) {
          return res.status(200).json({
            status: false,
            message: "Episode downloaded already exists!! ",
          });
        }

        download = new Download();

        download.userId = user._id;
        download.movieId = episode._id;
        download.type = req.body.type;

        await download.save();
      }

      return res.status(200).json({
        status: true,
        message: "Success!!",
        download,
      });
    } else {
      return res.status(200).json({
        status: false,
        message: "Oops ! Invalid details!!",
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};

//get userWise downloaded movie
//exports.userWiseDownload = async (req, res) => {
//   try {
//     const user = await User.findById(req.query.userId);
//     if (!user)
//       return res
//         .status(200)
//         .json({ status: false, message: "User does not found!!" });

//     const download = await Download.aggregate([
//       {
//         $match: {
//           $and: [{ userId: user._id }],
//         },
//       },
//       { $sort: { createdAt: -1 } },
//       {
//         $lookup: {
//           from: "movies",
//           localField: "movieId",
//           foreignField: "_id",
//           as: "movie",
//         },
//       },
//       {
//         $unwind: {
//           path: "$movie",
//           preserveNullAndEmptyArrays: false,
//         },
//       },
//       {
//         $project: {
//           _id: 1,
//           userId: 1,
//           movieId: "$movie._id",
//           movieImage: "$movie.image",
//           movieTitle: "$movie.title",
//           movieLink: "$movie.link",
//           movieRuntime: "$movie.runtime",
//           movieMediaType: "$movie.media_type",
//         },
//       },
//     ]);

//     return res
//       .status(200)
//       .json({ status: true, message: "Successful!!", download });
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json({
//       status: false,
//       error: error.message || "Internal Server error!!",
//     });
//   }
//};

exports.userWiseDownload = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) return res.status(200).json({ status: false, message: "User does not found!!" });

    const download = await Download.aggregate([
      {
        $match: {
          $and: [{ userId: user._id }],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "movies",
          let: {
            movieId: "$movieId", //movieId is field of download table
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$$movieId", "$_id"],
                },
              },
            },
            {
              $lookup: {
                from: "regions",
                as: "region",
                localField: "region",
                foreignField: "_id",
              },
            },
            {
              $unwind: {
                path: "$region",
                preserveNullAndEmptyArrays: false,
              },
            },
            {
              $project: {
                title: 1,
                image: 1,
                type: 1,
                videoType: 1,
                link: 1,
                media_type: 1,
                episodeNumber: null,
                episodeName: null,
                region: "$region.name",
              },
            },
          ],
          as: "movie",
        },
      },
      {
        $lookup: {
          from: "episodes",
          let: {
            webSeriesId: "$movieId", //movieId is field of download table
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ["$$webSeriesId", "$_id"],
                },
              },
            },
            {
              $lookup: {
                from: "movies",
                let: {
                  movieId: "$movie", //movie is field of episode table
                },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$$movieId", "$_id"],
                      },
                    },
                  },
                  {
                    $lookup: {
                      from: "regions",
                      as: "region",
                      localField: "region",
                      foreignField: "_id",
                    },
                  },
                  {
                    $unwind: {
                      path: "$region",
                      preserveNullAndEmptyArrays: false,
                    },
                  },
                  {
                    $project: {
                      title: 1,
                      image: 1,
                      type: 1,
                      videoType: 1,
                      link: 1,
                      media_type: 1,
                      region: "$region.name",
                    },
                  },
                ],
                as: "movie",
              },
            },
            {
              $unwind: {
                path: "$movie",
                preserveNullAndEmptyArrays: false,
              },
            },
            {
              $project: {
                _id: 1,
                image: 1,
                link: "$videoUrl",
                episodeName: "$name",
                episodeNumber: 1,
                media_type: "tv",
                title: "$movie.title",
                region: "$movie.region",
              },
            },
          ],
          as: "webSeriesId",
        },
      },
      {
        $project: {
          _id: 1,
          userId: 1,
          createdAt: 1,
          data: {
            $cond: [{ $eq: [1, { $size: "$webSeriesId" }] }, { $first: "$webSeriesId" }, { $first: "$movie" }],
          },
        },
      },
    ]);

    return res.status(200).json({ status: true, message: "Successful!!", download });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error!!",
    });
  }
};

//delete the downloaded movie
exports.destroy = async (req, res) => {
  try {
    const download = await Download.findById(req.query.downloadId);

    if (!download) {
      return res.status(200).json({ status: false, message: "Downloaded Movie does not Exist!!" });
    }

    await download.deleteOne();

    return res.status(200).json({ status: true, message: "Success!!" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error!!",
    });
  }
};
