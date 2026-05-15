const { createClient } = require('redis');

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required');
}

const client = createClient({ url: process.env.REDIS_URL })
  .on('error', (err) => console.error('Redis Client Error', err));

const ready = client.connect();

module.exports = { client, ready };
