const Tags = require("./tags.model");

//create tags
exports.store = async (req, res) => {
  try {
    if (!req.body.name) return res.status(200).json({ status: false, message: "Oops ! Invalid details." });

    const tags = await Tags.find({ name: req.body.name.toUpperCase().trim() });

    if (tags.length === 0) {
      const tags = new Tags();
      tags.name = req.body.name.toUpperCase().trim();
      await tags.save();

      return res.status(200).json({
        status: true,
        message: "Success",
        tags,
      });
    } else {
      return res.status(200).json({ status: false, message: "This tag already exists." });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//update tags
exports.update = async (req, res) => {
  try {
    if (!req.query.tagsId) {
      return res.status(200).json({ status: false, message: "tagsId is required!!" });
    }

    const tags_ = await Tags.find({ name: req?.query?.name?.toUpperCase().trim() });

    const tags = await Tags.findById(req.query.tagsId);
    if (!tags) {
      return res.status(200).json({ status: false, message: "Tag does not found!!" });
    }

    if (tags_.length === 0) {
      tags.name = req?.query?.name?.toUpperCase().trim();
      await tags.save();

      return res.status(200).json({
        status: true,
        message: "Success",
        tags,
      });
    } else {
      return res.status(200).json({ status: false, message: "Tag already exists." });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//delete tags
exports.destroy = async (req, res) => {
  try {
    if (!req.query.tagsId) {
      return res.status(200).json({ status: false, message: "tagsId must be required." });
    }

    const tags = Tags.findById(req.query.tagsId);
    if (!tags) {
      return res.status(200).json({ status: false, message: "Tag does not found." });
    }

    await tags.deleteOne();

    return res.status(200).json({ status: true, message: "Success" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//get tags
exports.get = async (req, res) => {
  try {
    const tags = await Tags.find().sort({ name: 1 });

    return res.status(200).json({ status: true, message: "Success", tags });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};