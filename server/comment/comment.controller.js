const Comment = require("./comment.model");

//dayjs
const dayjs = require("dayjs");

//mongoose
const mongoose = require("mongoose");

//import model
const Movie = require("../movie/movie.model");
const User = require("../user/user.model");

//create comment
exports.store = async (req, res) => {
  try {
    if (!req.user.userId || !req.body.comment || !req.body.movieId) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(200).json({ status: false, message: "User does not found!" });
    }

    const movie = await Movie.findById(req.body.movieId);
    if (!movie) {
      return res.status(200).json({ status: false, message: "No Movie Was found." });
    }

    const comment = new Comment();

    comment.userId = user._id;
    comment.movieId = movie._id;
    comment.comment = req.body.comment;
    comment.date = new Date().toLocaleString("en-US", { timeZone: "UTC" });
    await comment.save();

    movie.comment += 1;
    await movie.save();

    return res.status(200).json({ status: true, message: "Success", comment });
  } catch (error) {
    return res.status(200).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//destroy comment
exports.destroy = async (req, res) => {
  try {
    const comment = await Comment.findById(req.query.commentId);
    if (!comment) {
      return res.status(200).json({ status: false, message: "Comment does not found." });
    }

    if (comment.movieId !== null) {
      await Movie.updateOne({ _id: comment.movieId }, { $inc: { comment: -1 } }).where({ comment: { $gt: 0 } });
    }

    await comment.deleteOne();

    return res.status(200).json({ status: true, message: "Success" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get comment list of movie for android
exports.getComment = async (req, res) => {
  try {
    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res.status(200).json({ status: false, message: "No Movie Was found!!" });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(200).json({ status: false, message: "User does not found!!" });
    }

    let now = dayjs();

    const comments = await Comment.aggregate([
      {
        $match: { movieId: movie._id },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $lookup: {
          from: "likes",
          let: {
            commentId: "$_id",
            userId: user._id,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$commentId", "$$commentId"] }, { $eq: ["$userId", user._id] }],
                },
              },
            },
          ],
          as: "isLike",
        },
      },
      {
        $project: {
          userId: "$user._id",
          fullName: "$user.fullName",
          userImage: "$user.image",
          comment: 1,
          like: 1,
          date: 1,
          isLike: 1,
          createdAt: 1,
          isLike: {
            $cond: [{ $eq: [{ $size: "$isLike" }, 0] }, false, true],
          },
        },
      },
      {
        $facet: {
          comment: [
            { $skip: req.query.start ? parseInt(req.query.start) : 0 }, // how many records you want to skip
            { $limit: req.query.limit ? parseInt(req.query.limit) : 20 },
          ],
        },
      },
    ]);

    const comment = comments[0].comment.map((data) => ({
      ...data,
      time:
        now.diff(data.createdAt, "minute") === 0
          ? "Just Now"
          : now.diff(data.createdAt, "minute") <= 60 && now.diff(data.createdAt, "minute") >= 0
            ? now.diff(data.createdAt, "minute") + " minutes ago"
            : now.diff(data.createdAt, "hour") >= 24
              ? dayjs(data.createdAt).format("DD MMM, YYYY")
              : now.diff(data.createdAt, "hour") + " hour ago",
    }));

    return res.status(200).json({
      status: comment.length > 0 ? true : false,
      message: comment.length > 0 ? "Success" : "No Data Found.",
      comment: comment.length > 0 ? comment : [],
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: true,
      error: error.message || "Internal Server Error",
    });
  }
};

//get comment list of movie for admin panel
exports.getComments = async (req, res) => {
  try {
    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res.status(200).json({ status: false, message: "No Movie Was Found!!" });
    }

    let now = dayjs();

    const comments = await Comment.aggregate([
      {
        $match: { movieId: movie._id },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: false,
        },
      },

      {
        $project: {
          userId: "$user._id",
          fullName: "$user.fullName",
          userImage: "$user.image",
          comment: 1,
          date: 1,
          createdAt: 1,
        },
      },
    ]);

    const comment = await comments.map((data) => ({
      ...data,
      time:
        now.diff(data.createdAt, "minute") === 0
          ? "Just Now"
          : now.diff(data.createdAt, "minute") <= 60 && now.diff(data.createdAt, "minute") >= 0
            ? now.diff(data.createdAt, "minute") + " minutes ago"
            : now.diff(data.createdAt, "hour") >= 24
              ? dayjs(data.createdAt).format("DD MMM, YYYY")
              : now.diff(data.createdAt, "hour") + " hour ago",
    }));

    return res.status(200).json({
      status: comment.length > 0 ? true : false,
      message: comment.length > 0 ? "Success" : "No Data Found.",
      comment: comment.length > 0 ? comment : [],
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: true,
      error: error.message || "Internal Server Error",
    });
  }
};
