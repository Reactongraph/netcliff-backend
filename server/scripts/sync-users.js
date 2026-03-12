require('dotenv').config({ path: '../../.env' });

const mongoose = require('mongoose');
const User = require('../user/user.model');
const recombeeService = require('../services/recombee.service');

const BATCH_SIZE = parseInt(process.env.RECOMBEE_BATCH_SIZE || '500', 10);

async function syncUsersToRecombee() {
  try {
    console.log('Syncing users to Recombee...');
    
    let skip = 0;
    let totalSynced = 0;
    
    for (;;) {
      const users = await User.find({})
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean();
        
      if (!users.length) break;
      
      for (const user of users) {
        try {

          const result = await recombeeService.addUser(user);
          
          if (result.success) {
            totalSynced++;
            console.log(`[Recombee] Synced user ${totalSynced}: ${user._id}`);
          } else {
            console.error(`[Recombee] Failed to sync user ${user._id}:`, result.error);
          }
        } catch (error) {
          console.error(`[Recombee] Error syncing user ${user._id}:`, error.message);
        }
      }
      
      skip += users.length;
    }

    console.log(`\n[Recombee] User sync completed: ${totalSynced} users synced`);
  } catch (error) {
    console.error('[Recombee] User sync failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  mongoose.connect(process.env.MONGODB_CONNECTION_STRING || process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db-name')
    .then(() => {
      console.log('[Recombee] Connected to MongoDB');
      return syncUsersToRecombee();
    })
    .then(() => {
      mongoose.disconnect();
    })
    .catch(error => {
      console.error('[Recombee] Error:', error);
      mongoose.disconnect();
    });
}

module.exports = { syncUsersToRecombee };