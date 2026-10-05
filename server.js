const dotenv = require('dotenv');
dotenv.config();
const api = require('./api');
const { ready: redisReady } = require('./redis');
const { migrateKeys } = require('./agent/migrate');
const port = process.env.PORT || 80;

redisReady
  .then(() => migrateKeys().catch((err) => console.error('agent key migration failed', err)))
  .then(() => {
    api.listen(port, () => {
      console.log(`api listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to Redis', err);
    process.exit(1);
  });
