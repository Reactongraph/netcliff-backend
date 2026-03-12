const TicketByUser = require("../ticketByUser/ticketByUser.model");
const mongoose = require("mongoose");

//import model
const User = require("../user/user.model");

//ticket raised by the particular user
exports.ticketRaisedByUser = async (req, res, next) => {
  try {
    if (!req.user.userId) {
      return res
        .status(200)
        .json({ status: false, message: "userId must be required." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res
        .status(200)
        .json({ status: false, message: "user does not found." });
    }

    if (user.isBlock) {
      return res
        .status(200)
        .json({ status: false, message: "you are blocked by the admin." });
    }

    const ticketByUser = new TicketByUser();

    ticketByUser.userId = user._id;
    ticketByUser.description = req.body.description;
    ticketByUser.contactNumber = req.body.contactNumber;
    ticketByUser.image = req.body.image;
    ticketByUser.status = "Pending";

    await ticketByUser.save();

    return res.status(200).json({
      status: true,
      message: "Ticket has been raised by the user.",
      ticketByUser: ticketByUser,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//get all raised tickets for admin
exports.raisedTickets = async (req, res, next) => {
  try {
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;

    if (req.query.status === "Pending") {
      const totalTickets = await TicketByUser.find({
        status: "Pending",
      }).countDocuments();

      const ticketByUser = await TicketByUser.find({ status: "Pending" })
        .populate("userId", "fullName nickName image")
        .sort({ createdAt: -1 })
        .skip((start - 1) * limit)
        .limit(limit);

      return res.status(200).json({
        status: true,
        message: "Retrive raised tickets for admin.",
        totalTickets: totalTickets,
        ticketByUser: ticketByUser,
      });
    } else if (req.query.status === "Solved") {
      const totalTickets = await TicketByUser.find({
        status: "Solved",
      }).countDocuments();

      const ticketByUser = await TicketByUser.find({ status: "Solved" })
        .populate("userId", "fullName nickName image")
        .sort({ createdAt: -1 })
        .skip((start - 1) * limit)
        .limit(limit);

      return res.status(200).json({
        status: true,
        message: "Retrive raised tickets for admin.",
        totalTickets: totalTickets,
        ticketByUser: ticketByUser,
      });
    } else {
      return res
        .status(200)
        .json({ status: false, message: "status must be passed valid." });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      message: error.message || "Internal Server Error",
    });
  }
};

//ticket of particular user solved or not
exports.ticketSolve = async (req, res) => {
  try {
    if (!req.query.ticketId || !req.body.comment) {
      return res.status(200).json({ status: false, message: "Invalid input." });
    }

    const raisedTicket = await TicketByUser.findById(
      req.query.ticketId
    ).populate("userId", "fullName nickName image");
    if (!raisedTicket) {
      return res
        .status(200)
        .json({ status: false, message: "raisedTicket does not found." });
    }

    raisedTicket.status = "Solved";
    raisedTicket.comment = req.body.comment;
    await raisedTicket.save();

    return res.status(200).json({
      status: true,
      message: "Ticket of the particular user has been solved.",
      raisedTicket,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ status: false, error: error.message || "Internal server error" });
  }
};

//get all raised tickets for admin
exports.myRaisedTickets = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const status = req.query.status;

    const matchQuery = {
      userId: new mongoose.Types.ObjectId(userId),
    };
    if (status) {
      matchQuery.status = status;
    }

    const list = await TicketByUser.aggregate([
      {
        $match: matchQuery,
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
