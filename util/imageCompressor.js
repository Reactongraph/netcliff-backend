const sharp = require('sharp');

/**
 * Compresses an image and converts it to WebP format.
 * @param {Buffer} buffer - The input image buffer.
 * @returns {Promise<{buffer: Buffer, info: any}>} - The compressed WebP buffer and info.
 */
async function compressToWebP(buffer) {
    try {
        const { data, info } = await sharp(buffer)
            .webp({ quality: 80, effort: 6 })
            .toBuffer({ resolveWithObject: true });

        return { buffer: data, info };
    } catch (error) {
        console.error('Error compressing image:', error);
        throw error;
    }
}

module.exports = { compressToWebP };
