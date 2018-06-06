const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const apiRoutes = express.Router();
const api = express();

/**
 * Limit each IP to 1000 (max) requests per 1h (windowMs)
 * return responses in full speed (delayMs) until the limit is reached
 */
let limiter = new rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1000,
  delayMs: 0
});

api.use(limiter);

/**
 * set security-related HTTP headers
 */
api.use(helmet());

/**
 * enable cors including pre-flight
 */
api.options('*', cors())

/**
 * remove default express header
 */
api.disable('x-powered-by');

api.use(morgan('dev'));

/**
 * use body parser so we can handle both POST and/or URL parameters
 * suports both application/x-www-form-urlencoded & application/json
 */
api.use(bodyParser.urlencoded({extended: true}));
api.use(bodyParser.json());

apiRoutes.get('/hello', (req, res) => {
  let time = new Date();
  const dayNames = new Array('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday');
  const greet = dayNames[time.getDay()];

  res.json(`Happy ${greet}!`);
});

/**
 * expose over api entrypoint
 */
api.use('/', apiRoutes);
module.exports = api;