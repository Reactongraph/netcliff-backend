const Rating = require("../rating/rating.model");

//import model
const User = require("../user/user.model");
const Movie = require("../movie/movie.model");

//create rating
exports.addRating = async (req, res) => {
  try {
    if (!req.query.movieId || !req.user.userId || !req.query.rating) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details!!" });
    }

    console.log('rew', req.query)
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(200).json({ status: false, message: "User does not found!!" });

    const movie = await Movie.findById(req.query.movieId);
    if (!movie) return res.status(200).json({ status: false, message: "No Movie Was Found!!" });

    const ratingExist = await Rating.findOne({
      userId: user._id,
      movieId: movie._id,
    });

    if (ratingExist) {
      return res.status(200).json({
        status: false,
        message: "You don't have right to give rate because you have already rated on this movie!!",
      });
    }

    const rating = new Rating();

    rating.userId = user._id;
    rating.movieId = movie._id;
    rating.rating = req.query.rating;

    await rating.save();

    return res.status(200).json({
      status: true,
      message: "Rating Added successfully!!",
      rating,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};

//get rating
exports.getRating = async (req, res) => {
  try {
    const totalRating = await Rating.aggregate([
      {
        $group: {
          _id: "$movieId",
          totalUser: { $sum: 1 }, //totalRating by user
          avgRating: { $avg: "$rating" },
        },
      },
      { $sort: { avgRating: -1 } },
    ]);

    return res.status(200).json({ status: true, message: "Success!!", totalRating });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};
