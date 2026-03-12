require('dotenv').config({ path: '../../.env' });

const recombee = require('recombee-api-client');
const r = recombee.requests;

const db = process.env.RECOMBEE_DB;
const privateToken = process.env.RECOMBEE_PRIVATE_TOKEN;
const region = process.env.RECOMBEE_REGION || 'eu-west';

if (!db || !privateToken) {
  console.warn('[Recombee] Missing RECOMBEE_DB or RECOMBEE_PRIVATE_TOKEN environment variables.');
}

const client = new recombee.ApiClient(db, privateToken, { region });

async function setupRecombeeDatabase() {
  try {
    console.log('Setting up Recombee database properties...');

    // Add item properties (movie attributes)
    const requests = [
      new r.AddItemProperty('title', 'string'),
      new r.AddItemProperty('releaseYear', 'int'),
      new r.AddItemProperty('regionNames', 'set'),
      new r.AddItemProperty('genreNames', 'set'),
      new r.AddItemProperty('languageNames', 'set'),
      new r.AddItemProperty('tagNames', 'set'),
      new r.AddItemProperty('maturity', 'string'),
      new r.AddItemProperty('runtime', 'int'),
      new r.AddItemProperty('view', 'double'),
      new r.AddItemProperty('contentRating', 'int'),
      new r.AddItemProperty('exclusive', 'boolean'),
      new r.AddItemProperty('featured', 'boolean'),
      new r.AddItemProperty('newReleased', 'boolean'),

      new r.AddUserProperty('city', 'string'),
      new r.AddUserProperty('countrySubdivision', 'string')
    ];

    await client.send(new r.Batch(requests));
    console.log('[Recombee] Properties defined successfully');

    console.log('\n✓ Recombee database setup completed!');
    console.log('\nNext steps:');
    console.log('1. Sync your existing movies to Recombee');
    console.log('2. Start tracking user interactions');
    console.log('3. Use the recommendation endpoints in your Flutter app');

  } catch (error) {
    console.error('Setup failed:', error);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupRecombeeDatabase();
}

module.exports = { setupRecombeeDatabase };