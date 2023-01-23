const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const fetch = require('node-fetch');
const multer  = require('multer');
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
var os = require("os");
// 
const { testVerbs, httpStatuses, testStatus } = require('./routes');
const { hello, uuid, ref, haiku, sprintName, hexColor, ip, userAgent, version } = require('./routes');
const { encode64, decode64 } = require('./routes');
const { postAnything, getAnything, putAnything, deleteAnything, purgeAnything } = require('./routes');
const { fileUpload } = require('./routes');
const { getReplay, postReplay} = require('./routes');
const { postDelay } = require('./routes');
// 
const apiRoutes = express.Router();
const api = express();

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'api.bondarewicz.com',
      version: `1.0.1`,
    },
    servers: [
      {
        url: 'https://api.bondarewicz.com/v1',
        description: 'prod',
      },
      {
        url: 'http://localhost:8080/v1',
        description: 'dev',
      },
    ],
    basePath: '/v1/',
  },
  apis: ['./api.js'], // files containing annotations as above
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * middleware
 */
let customHeaders = (req, res, next) => {
  
  // TODO links as per http://jsonapi.org/
  // res.setHeader('Content-Type', 'application/vnd.api+json');

  
  // cors
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
}

api.use(customHeaders);

/**
 * Limit each IP to 1000 (max) requests per 1h (windowMs)
 * return responses in full speed (delayMs) until the limit is reached
 */
let limits = new rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1000,
  delayMs: 0
});

api.use(limits);

/**
 * enable cors including pre-flight
 * remove default express header
 * set security-related HTTP headers
 * enable logging
 */
api.options('*', cors())
api.disable('x-powered-by');
api.enable('trust proxy');
api.use(helmet());
api.use(morgan('dev'));

/**
 * use body parser so we can handle both POST and/or URL parameters
 * suports both application/x-www-form-urlencoded & application/json
 */
api.use(bodyParser.urlencoded({extended: true}));
api.use(bodyParser.json());

apiRoutes.use('/', swaggerUi.serve);
apiRoutes.get('/', swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /hello:
 *   get:
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: Returns a greeting
 */
apiRoutes.get('/hello', hello);

/**
 * @swagger
 * /version:
 *   get:
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: Returns version of latest website
 */
apiRoutes.get('/version', version);

/**
 * @swagger
 * /uuid:
 *   get:
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: Returns new uuid
 */
apiRoutes.get('/uuid', uuid);
apiRoutes.get('/ref', ref);
apiRoutes.get('/haiku', haiku);
apiRoutes.get('/sprint', sprintName);
apiRoutes.get('/color', hexColor);

/**
 * @swagger
 * /ip:
 *   get:
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: Returns your ip
 */
apiRoutes.get('/ip', ip);

/**
 * @swagger
 * /ua:
 *   get:
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: Returns your user agent
 */
apiRoutes.get('/ua', userAgent);

/**
 * @swagger
 * /encode64/{value}:
 *   get:
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: path
 *         name: value
 *         schema:
 *           type: string
 *         required: true
 *         description: The string value to be encoded
 *     responses:
 *       200:
 *         description: Returns your base64 encoded result
 */
apiRoutes.get('/encode64/:value', encode64);

/**
 * @swagger
 * /decode64/{value}:
 *   get:
 *     produces:
 *       - application/json
 *     parameters:
 *       - in: path
 *         name: value
 *         schema:
 *           type: string
 *         required: true
 *         description: The string value to be decoded
 *     responses:
 *       200:
 *         description: Returns your decoded result
 */
apiRoutes.get('/decode64/:value', decode64);

/**
 * HTTP verbs
 */
apiRoutes.get('/verbs', testVerbs);
apiRoutes.post('/verbs', testVerbs);
apiRoutes.put('/verbs', testVerbs);
apiRoutes.patch('/verbs', testVerbs);
apiRoutes.delete('/verbs', testVerbs);
apiRoutes.purge('/verbs', testVerbs);

/**
 * HTTP status codes
 */
apiRoutes.get('/status', httpStatuses);
apiRoutes.get('/status/:code', testStatus);
apiRoutes.post('/status/:code', testStatus);
apiRoutes.put('/status/:code', testStatus);
apiRoutes.patch('/status/:code', testStatus);
apiRoutes.delete('/status/:code', testStatus);

/**
 * anything
 */
apiRoutes.post('/anythings/:id?', postAnything);
apiRoutes.get('/anythings/:id?', getAnything);
apiRoutes.put('/anythings/:id?', putAnything);
apiRoutes.delete('/anythings/:id?', deleteAnything);
apiRoutes.purge('/anythings', purgeAnything);

/**
 * file upload
 */
apiRoutes.post('/upload', upload.any(), fileUpload);

/**
 * replay
 * create a sequence of POST requests 
 * then GET exactly what you have POST'ed
 */
apiRoutes.post('/replay', postReplay);
apiRoutes.get('/replay', getReplay);

/**
 * delay
 * add's intentional delay to a response
 */
apiRoutes.post('/delay/:value', postDelay);

/**
 * expose over v1 entrypoint
 */
api.use('/v1', apiRoutes);
module.exports = api;