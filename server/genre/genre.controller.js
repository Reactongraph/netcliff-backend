const Genre = require("./genre.model");
const Movie = require("../movie/movie.model");

//axios
const axios = require("axios");


//create genre from TMDB database
exports.getStore = async (req, res) => {
  try {
    await axios
      .all([
        axios.get("https://api.themoviedb.org/3/genre/movie/list?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US"),
        axios.get("https://api.themoviedb.org/3/genre/tv/list?api_key=67af5e631dcbb4d0981b06996fcd47bc&language=en-US"),
      ])
      .then(
        axios.spread(async (data1, data2) => {
          //data1 map
          await data1.data.genres.map(async (data) => {

            const genre = new Genre();

            genre.name = data.name.toUpperCase().trim();
            genre.uniqueId = data.id;
            await genre.save();
          });

          //data2 map
          await data2.data.genres.map(async (data) => {

            const genreExist = await Genre.findOne({ uniqueId: data.id });

            if (!genreExist) {
              const genre = new Genre();

              genre.name = data.name.toUpperCase().trim();
              genre.uniqueId = data.id;
              await genre.save();
            }
          });
        })
      )
      .catch((error) => console.log(error));
    return res.status(200).json({ status: true, message: "Genre Imported Successfully." });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//create genre
exports.store = async (req, res) => {
  try {
    if (!req.body.name) return res.status(200).json({ status: false, message: "Oops ! Invalid details." });

    const genre = await Genre.find({ name: req.body.name.toUpperCase().trim() });

    if (genre.length === 0) {
      const genre = new Genre();
      genre.name = req.body.name.toUpperCase().trim();
      await genre.save();

      return res.status(200).json({
        status: true,
        message: "Success",
        genre,
      });
    } else {
      return res.status(200).json({ status: false, message: "This genre already exists." });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//update genre
exports.update = async (req, res) => {
  try {
    if (!req.query.genreId) {
      return res.status(200).json({ status: false, message: "genreId is required!!" });
    }

    const genre_ = await Genre.find({ name: req?.query?.name?.toUpperCase().trim() });

    const genre = await Genre.findById(req.query.genreId);
    if (!genre) {
      return res.status(200).json({ status: false, message: "Genre does not found!!" });
    }

    if (genre_.length === 0) {
      const oldName = genre.name;
      genre.name = req?.query?.name?.toUpperCase().trim();
      await genre.save();

      // Optimized Bulk Update: Sync name change to all movies using this genre
      await Movie.updateMany(
        { genre: genre._id, genres: oldName },
        {
          $set: {
            "genres.$[elem]": genre.name,
          },
        },
        {
          arrayFilters: [{ elem: oldName }],
        }
      );

      return res.status(200).json({
        status: true,
        message: "Success",
        genre,
      });
    } else {
      return res.status(200).json({ status: false, message: "Genre already exists." });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server Error",
    });
  }
};

//delete genre
exports.destroy = async (req, res) => {
  try {
    if (!req.query.genreId) {
      return res.status(200).json({ status: false, message: "genreId must be required." });
    }

    const genre = Genre.findById(req.query.genreId);
    if (!genre) {
      return res.status(200).json({ status: false, message: "Genre does not found." });
    }

    await genre.deleteOne();

    return res.status(200).json({ status: true, message: "Success" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

//get genre
exports.get = async (req, res) => {
  try {
    const genre = await Genre.find().sort({ name: 1 });

    return res.status(200).json({ status: true, message: "Success", genre });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};
