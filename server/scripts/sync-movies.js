require('dotenv').config({ path: '../../.env' });

const mongoose = require('mongoose');
const Movie = require('../movie/movie.model');
const recombeeService = require('../services/recombee.service');

const BATCH_SIZE = parseInt(process.env.RECOMBEE_BATCH_SIZE || '10', 10);

function safeArray(value) {
  return Array.isArray(value) ? value : (value ? [value] : []);
}

async function syncMoviesToRecombee() {
  try {
    console.log('Syncing movies to Recombee...');

    let skip = 0;
    let totalSynced = 0;

    let hasMore = true;

    while (hasMore) {
      const movies = await Movie.aggregate([
        { $match: { status: 'PUBLISHED' } },
        { $skip: skip },
        { $limit: BATCH_SIZE },
        {
          $lookup: {
            from: 'genres',
            localField: 'genre',
            foreignField: '_id',
            as: 'genreData'
          }
        },
        {
          $lookup: {
            from: 'languages',
            localField: 'language',
            foreignField: '_id',
            as: 'languageData'
          }
        },
        {
          $lookup: {
            from: 'tags',
            localField: 'tags',
            foreignField: '_id',
            as: 'tagData'
          }
        },
        {
          $lookup: {
            from: 'regions',
            localField: 'region',
            foreignField: '_id',
            as: 'regionData'
          }
        },
        {
          $project: {
            _id: 1,
            title: 1,
            year: 1,
            maturity: 1,
            runtime: 1,
            view: 1,
            regionNames: '$regionData.name',
            genreNames: '$genreData.name',
            languageNames: '$languageData.name',
            tagNames: '$tagData.name'
          }
        }
      ]);

      if (!movies.length) {
        hasMore = false;
        break;
      }

      const batchMovies = movies.map(movie => ({
        id: movie._id.toString(),
        data: {
          title: movie.title || null,
          releaseYear: movie.year ? parseInt(movie.year, 10) : null,
          regionNames: safeArray(movie.regionNames).filter(Boolean),
          genreNames: safeArray(movie.genreNames).filter(Boolean),
          languageNames: safeArray(movie.languageNames).filter(Boolean),
          tagNames: safeArray(movie.tagNames).filter(Boolean),
          maturity: movie.maturity || null,
          runtime: Number.isFinite(movie.runtime) ? Math.round(Number(movie.runtime)) : null,
          view: Number.isFinite(movie.view) ? movie.view : 0
        }
      }));

      const result = await recombeeService.batchAddMovies(batchMovies);

      if (result.success) {
        totalSynced += movies.length;
        console.log(`[Recombee] Synced movies ${totalSynced}`);
      } else {
        console.error(`[Recombee] Batch sync failed:`, result.error);
      }

      skip += movies.length;
    }

    console.log(`\n[Recombee] Sync completed: ${totalSynced} movies synced`);
  } catch (error) {
    console.error('[Recombee] Sync failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_CONNECTION_STRING || process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db-name')
    .then(() => {
      console.log('[Recombee] Connected to MongoDB');
      return syncMoviesToRecombee();
    })
    .then(() => {
      mongoose.disconnect();
    })
    .catch(error => {
      console.error('[Recombee] Error:', error);
      mongoose.disconnect();
    });
}

module.exports = { syncMoviesToRecombee };