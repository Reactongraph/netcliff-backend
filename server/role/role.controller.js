const Role = require("./role.model");

//deleteFromAzure
const { deleteFromAzure } = require("../../util/deleteFromAzure");

//import model
const Movie = require("../movie/movie.model");

//create role
exports.store = async (req, res) => {
  try {
    if (!req.body.name || !req.body.position || !req.body.image || !req.body.movieId) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details!" });
    }

    const movie = await Movie.findById(req.body.movieId);
    if (!movie) {
      return res.status(200).json({ status: false, message: "Movie does not found!" });
    }

    const role = new Role();

    role.name = req?.body?.name;
    role.position = req?.body?.position;
    role.movie = movie._id;
    role.image = req?.body?.image;
    role.updateType = 1;
    await role.save();

    const data = await Role.findById(role._id).populate("movie", "title");

    return res.status(200).json({
      status: true,
      message: "role Inserted Successfully.",
      role: data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//update role
exports.update = async (req, res) => {
  try {
    const role = await Role.findById(req.query.roleId);
    if (!role) {
      return res.status(200).json({ status: false, message: "Role does not found!!" });
    }

    //delete the old image from digitalOcean Spaces
    if (req.body.image) {
      const urlParts = role.image.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element

      await deleteFromAzure({ folderStructure, keyName });

      role.updateType = 1;
      role.image = req.body.image ? req.body.image : role.image;
    }

    role.name = req.body.name ? req.body.name : role.name;
    role.position = req.body.position ? req.body.position : role.position;
    role.movie = req.body.movie ? req.body.movie : role.movie;
    await role.save();

    const data = await Role.findById(role._id).populate("movie", "title");

    return res.status(200).json({
      status: true,
      message: "role Updated Successfully.",
      role: data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//delete role
exports.destroy = async (req, res) => {
  try {
    const role = await Role.findById(req.query.roleId);
    if (!role) {
      return res.status(200).json({ status: false, message: "Role does not found!!" });
    }

    //delete the old image from digitalOcean Spaces
    if (role.image) {
      const urlParts = role.image.split("/");
      const keyName = urlParts.pop(); //remove the last element
      const folderStructure = urlParts.slice(3).join("/"); //Join elements starting from the 4th element+

      await deleteFromAzure({ folderStructure, keyName });
    }

    await role.deleteOne();

    return res.status(200).json({ status: true, message: "role deleted Successfully." });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//get all role
exports.get = async (req, res) => {
  try {
    const role = await Role.find().populate("movie", "title").sort({ createdAt: -1 });

    return res.status(200).json({ status: true, message: "Success", role });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//get role movieId wise for admin
exports.getIdWise = async (req, res) => {
  try {
    if (!req.query.movieId) return res.status(200).json({ status: true, message: "Oops ! Invalid details!!" });

    const movie = await Movie.findById(req.query.movieId);
    if (!movie) {
      return res.status(500).json({ status: false, message: "No Movie Was Found!!" });
    }

    const role = await Role.find({ movie: movie._id }).populate("movie", "title updateType convertUpdateType").sort({ createdAt: -1 });

    return res.status(200).json({ status: true, message: "Success", role });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};
