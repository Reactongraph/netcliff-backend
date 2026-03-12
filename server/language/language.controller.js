const Language = require("./language.model");

exports.get = async (req, res) => {
  try {
    const languages = await Language.find().sort({ name: 1 });

    return res
      .status(200)
      .json({ status: true, message: "Success", languages });
  } catch (error) {
    return res.status(500).json({
      status: false,
      error: error.message || "Internal Server error",
    });
  }
};

// const allLanguages = [
//   {
//     name: "Afrikaans",
//     uniqueId: "af",
//   },
//   {
//     name: "Arabic",
//     uniqueId: "ar",
//   },
//   {
//     name: "Bengali",
//     uniqueId: "bn",
//   },
//   {
//     name: "Bulgarian",
//     uniqueId: "bg",
//   },
//   {
//     name: "Chinese (Simplified)",
//     uniqueId: "zh-CN",
//   },
//   {
//     name: "Chinese (Traditional)",
//     uniqueId: "zh-TW",
//   },
//   {
//     name: "Croatian",
//     uniqueId: "hr",
//   },
//   {
//     name: "Czech",
//     uniqueId: "cs",
//   },
//   {
//     name: "Danish",
//     uniqueId: "da",
//   },
//   {
//     name: "Dutch",
//     uniqueId: "nl",
//   },
//   {
//     name: "English",
//     uniqueId: "en",
//   },
//   {
//     name: "Estonian",
//     uniqueId: "et",
//   },
//   {
//     name: "Filipino",
//     uniqueId: "tl",
//   },
//   {
//     name: "Finnish",
//     uniqueId: "fi",
//   },
//   {
//     name: "French",
//     uniqueId: "fr",
//   },
//   {
//     name: "German",
//     uniqueId: "de",
//   },
//   {
//     name: "Greek",
//     uniqueId: "el",
//   },
//   {
//     name: "Hebrew",
//     uniqueId: "he",
//   },
//   {
//     name: "Hindi",
//     uniqueId: "hi",
//   },
//   {
//     name: "Hungarian",
//     uniqueId: "hu",
//   },
//   {
//     name: "Indonesian",
//     uniqueId: "id",
//   },
//   {
//     name: "Italian",
//     uniqueId: "it",
//   },
//   {
//     name: "Japanese",
//     uniqueId: "ja",
//   },
//   {
//     name: "Korean",
//     uniqueId: "ko",
//   },
//   {
//     name: "Latvian",
//     uniqueId: "lv",
//   },
//   {
//     name: "Lithuanian",
//     uniqueId: "lt",
//   },
//   {
//     name: "Malay",
//     uniqueId: "ms",
//   },
//   {
//     name: "Norwegian",
//     uniqueId: "no",
//   },
//   {
//     name: "Polish",
//     uniqueId: "pl",
//   },
//   {
//     name: "Portuguese",
//     uniqueId: "pt",
//   },
//   {
//     name: "Punjabi",
//     uniqueId: "pa",
//   },
//   {
//     name: "Romanian",
//     uniqueId: "ro",
//   },
//   {
//     name: "Russian",
//     uniqueId: "ru",
//   },
//   {
//     name: "Serbian",
//     uniqueId: "sr",
//   },
//   {
//     name: "Slovak",
//     uniqueId: "sk",
//   },
//   {
//     name: "Slovenian",
//     uniqueId: "sl",
//   },
//   {
//     name: "Spanish",
//     uniqueId: "es",
//   },
//   {
//     name: "Swahili",
//     uniqueId: "sw",
//   },
//   {
//     name: "Swedish",
//     uniqueId: "sv",
//   },
//   {
//     name: "Thai",
//     uniqueId: "th",
//   },
//   {
//     name: "Turkish",
//     uniqueId: "tr",
//   },
//   {
//     name: "Ukrainian",
//     uniqueId: "uk",
//   },
//   {
//     name: "Vietnamese",
//     uniqueId: "vi",
//   },
// ];
