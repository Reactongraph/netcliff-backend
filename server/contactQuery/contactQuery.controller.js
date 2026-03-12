const TicketByUser = require("../ticketByUser/ticketByUser.model");
const mongoose = require("mongoose");

const User = require("../user/user.model");
const ContactQuery = require("./contactQuery.model");
const { sendEmail } = require("../../util/email");
const { contactUsQueryTemplate } = require("../../util/emailTemplates");

exports.create = async (req, res) => {
  try {
    if (
      !req.body.name ||
      !req.body.email ||
      !req.body.phoneNumber ||
      !req.body.message
    ) {
      return res.status(400).json({ status: false, message: "Invalid data." });
    }

    let user = await User.findById(req.user?.userId);
    if (!user) {
      return res.status(200).json({ status: false, message: "Invalid user." });
    }

    const newQuery = new ContactQuery();
    newQuery.name = req.body.name;
    newQuery.email = req.body.email;
    newQuery.phoneNumber = req.body.phoneNumber;
    newQuery.userId = req.user.userId;
    newQuery.message = req.body.message;
    newQuery.status = "Pending";

    await newQuery.save();

    const template = contactUsQueryTemplate();

    let html = template.html;
    html = html.replace("{{NAME}}", req.body.name || "_");
    html = html.replace("{{EMAIL}}", req.body.email || "_");
    html = html.replace("{{PHONE}}", req.body.phoneNumber || "_");
    html = html.replace("{{MESSAGE}}", req.body.message || "_");

    await sendEmail(process.env.EMAIL, template.subject, html);

    return res.status(200).json({
      status: true,
      message: "Query send to admin.",
      newQuery: newQuery,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getAllForAdmin = async (req, res, next) => {
  const { start, limit, status } = req.query;

  try {
    const matchQuery = {};
    // match ---
    if (status) {
      matchQuery.status = status;
    }
    // pagination ---
    const paginationQuery = {
      start: 1,
      limit: 25,
    };
    if (limit && !isNaN(limit)) {
      paginationQuery.limit = parseInt(limit);
    }
    if (start && !isNaN(start)) {
      paginationQuery.start = parseInt(start);
    }
    const paginationPipe = [
      {
        $skip: (paginationQuery.start - 1) * paginationQuery.limit,
      },
      {
        $limit: paginationQuery.limit,
      },
    ];

    const queries = await ContactQuery.aggregate([
      {
        $match: matchQuery,
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      ...paginationPipe,
    ]);
    let totalQueries = await ContactQuery.aggregate([{ $match: matchQuery }]);
    totalQueries = totalQueries.length;

    return res.status(200).json({
      status: true,
      message: "Retrive queries.",
      totalQueries: totalQueries,
      queries: queries,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

exports.solve = async (req, res) => {
  try {
    if (!req.query.queryId || !req.body.comment) {
      return res.status(400).json({ status: false, message: "Invalid input." });
    }

    const contectQuery = await ContactQuery.findById(req.query.queryId);
    if (!contectQuery) {
      return res
        .status(404)
        .json({ status: false, message: "contect query does not found." });
    }

    contectQuery.status = "Solved";
    contectQuery.comment = req.body.comment;
    await contectQuery.save();

    // let emailTo = contectQuery.email;
    // if (!emailTo) {
    //   emailTo = await User.findById(contectQuery.userId);
    //   emailTo = emailTo?.email;
    // }
    // if (emailTo) {
    //   const template = contactUsSolveTemplate();
    //   let html = template.html;
    //   html = html.replace("{{COMMENT}}", contectQuery.comment);
    //   await sendEmail(emailTo, template.subject, html);
    // }

    return res.status(200).json({
      status: true,
      message: "Contact query has been solved.",
      contectQuery,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal server error" });
  }
};

exports.getAllForUser = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const status = req.query.status;

    const matchQuery = {
      userId: new mongoose.Types.ObjectId(userId),
    };
    if (status) {
      matchQuery.status = status;
    }

    const list = await ContactQuery.aggregate([
      {
        $match: matchQuery,
      },
      {
        $project: {
          updatedAt: 0,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);

    return res.status(200).json({ status: true, list });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};
