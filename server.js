const dotenv = require('dotenv');
dotenv.config();
const api = require('./api');
const { ready: redisReady } = require('./redis');
const port = process.env.PORT || 80;

redisReady
  .then(() => {
    api.listen(port, () => {
      console.log(`api listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to Redis', err);
    process.exit(1);
  });
