const User = require("../user/user.model");
const Movie = require("../movie/movie.model");
const Premiumplan = require("../premiumPlan/premiumPlan.model");

//get Admin Panel Dashboard
exports.dashboard = async (req, res) => {
  try {
    const user = await User.find().countDocuments();
    const movie = await Movie.find({ media_type: "movie" }).countDocuments();
    const series = await Movie.find({ media_type: "tv" }).countDocuments();
    const premiumPlanUser = await User.find({ isPremiumPlan: true }).countDocuments();

    //premiumPlan revenue
    const planRevenue = await Premiumplan.aggregate([
      {
        $lookup: {
          from: "premiumplanhistories",
          let: { planId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$premiumPlanId", "$$planId"] },
              },
            },
          ],
          as: "premiumplan",
        },
      },
      {
        $unwind: {
          path: "$premiumplan",
        },
      },
      {
        $group: {
          _id: null,
          dollar: { $sum: "$price" },
        },
      },
    ]);

    const dashboard = {
      user,
      movie,
      series,
      premiumPlanUser,
      revenue: {
        dollar: planRevenue.length > 0 ? planRevenue[0].dollar : 0,
      },
    };

    return res.status(200).json({ status: true, message: "Success", dashboard });
  } catch (error) {
    return res.status(200).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get date wise analytic for movie and webseries
exports.movieAnalytic = async (req, res) => {
  try {
    if (!req.query.type || !req.query.startDate || !req.query.endDate) {
      return res.status(200).json({ status: false, message: "Oops!! Invalid Details!!" });
    }

    var matchQuery;
    if (req.query.type === "WebSeries") {
      matchQuery = { media_type: "tv" };
    } else if (req.query.type === "Movie") {
      matchQuery = { media_type: "movie" };
    }

    //console.log("matchQuery--",matchQuery);

    let dateFilterQuery = {};

    let start_date = new Date(req.query.startDate);
    let end_date = new Date(req.query.endDate);

    dateFilterQuery = {
      analyticDate: {
        $gte: start_date,
        $lte: end_date,
      },
    };

    //console.log("dateFilterQuery--", dateFilterQuery);

    if (req.query.type === "Movie") {
      const movie = await Movie.aggregate([
        {
          $addFields: {
            analyticDate: {
              $toDate: {
                $arrayElemAt: [{ $split: ["$date", ", "] }, 0],
              },
            },
          },
        },
        {
          $match: {
            $and: [dateFilterQuery],
            $or: [matchQuery],
          },
        },
        {
          $group: {
            _id: "$analyticDate",
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]);

      return res.status(200).json({ status: true, message: "Success!!", analytic: movie });
    }

    if (req.query.type === "WebSeries") {
      const movie = await Movie.aggregate([
        {
          $addFields: {
            analyticDate: {
              $toDate: {
                $arrayElemAt: [{ $split: ["$date", ", "] }, 0],
              },
            },
          },
        },
        {
          $match: {
            $and: [dateFilterQuery],
            $or: [matchQuery],
          },
        },
        {
          $group: {
            _id: "$analyticDate",
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]);

      return res.status(200).json({ status: true, message: "Success!!", analytic: movie });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};

//get date wise analytic for user and revenue
exports.userAnalytic = async (req, res) => {
  try {
    if (!req.query.type || !req.query.startDate || !req.query.endDate) {
      return res.status(200).json({ status: false, message: "Oops!! Invalid Details!!" });
    }

    let dateFilterQuery = {};

    let start_date = new Date(req.query.startDate);
    let end_date = new Date(req.query.endDate);

    dateFilterQuery = {
      analyticDate: {
        $gte: start_date,
        $lte: end_date,
      },
    };

    //console.log("dateFilterQuery--", dateFilterQuery);

    if (req.query.type === "User") {
      const user = await User.aggregate([
        {
          $addFields: {
            analyticDate: {
              $toDate: {
                $arrayElemAt: [{ $split: ["$date", ", "] }, 0],
              },
            },
          },
        },
        {
          $match: dateFilterQuery,
        },
        {
          $group: {
            _id: "$analyticDate",
            count: {
              $sum: 1,
            },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]);

      return res.status(200).json({ status: true, message: "Success!!", analytic: user });
    }

    if (req.query.type === "Revenue") {
      //premiumPlan revenue
      const planRevenue = await Premiumplan.aggregate([
        {
          $lookup: {
            from: "premiumplanhistories",
            let: { planId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$premiumPlanId", "$$planId"] },
                },
              },
              {
                $addFields: {
                  analyticDate:  "$date"
                },
              },
              {
                $match: dateFilterQuery,
              },
              // {
              //   $group: {
              //     _id: "$analyticDate",
              //     count: {
              //       $sum: 1,
              //     },
              //   },
              // },
            ],
            as: "premiumplan",
          },
        },
        {
          $unwind: {
            path: "$premiumplan",
          },
        },
        {
          $group: {
            _id: "$premiumplan.analyticDate",
            dollar: { $sum: "$price" },
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]);

      return res.status(200).json({
        status: true,
        message: "Success!!",
        analytic: planRevenue,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error!!",
    });
  }
};
