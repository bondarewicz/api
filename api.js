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
const { geoip, qrCode, visits, weather } = require('./routes');
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
 *     tags: [Utility]
 *     summary: Day-of-week greeting
 *     responses:
 *       200:
 *         description: A greeting string
 */
apiRoutes.get('/hello', hello);

/**
 * @swagger
 * /version:
 *   get:
 *     tags: [Utility]
 *     summary: Latest commit info for bondarewicz/com
 *     responses:
 *       200:
 *         description: Object with url + short sha of the latest commit
 */
apiRoutes.get('/version', version);

/**
 * @swagger
 * /uuid:
 *   get:
 *     tags: [Utility]
 *     summary: Random UUID v4
 *     responses:
 *       200:
 *         description: A new UUID string
 */
apiRoutes.get('/uuid', uuid);

/**
 * @swagger
 * /ref:
 *   get:
 *     tags: [Utility]
 *     summary: Random 36-char alphanumeric reference
 *     responses:
 *       200:
 *         description: A random reference string
 */
apiRoutes.get('/ref', ref);

/**
 * @swagger
 * /haiku:
 *   get:
 *     tags: [Utility]
 *     summary: Heroku-style haiku name (adjective-noun-NNNN)
 *     responses:
 *       200:
 *         description: A friendly random name
 */
apiRoutes.get('/haiku', haiku);

/**
 * @swagger
 * /sprint:
 *   get:
 *     tags: [Utility]
 *     summary: Current ISO sprint identifier (YYYYWww)
 *     responses:
 *       200:
 *         description: Sprint name based on ISO week number
 */
apiRoutes.get('/sprint', sprintName);

/**
 * @swagger
 * /color:
 *   get:
 *     tags: [Utility]
 *     summary: Random hex color
 *     responses:
 *       200:
 *         description: A random color like "#a1b2c3"
 */
apiRoutes.get('/color', hexColor);

/**
 * @swagger
 * /ip:
 *   get:
 *     tags: [Utility]
 *     summary: Caller's IP address
 *     responses:
 *       200:
 *         description: The client's IP
 */
apiRoutes.get('/ip', ip);

/**
 * @swagger
 * /geoip:
 *   get:
 *     tags: [Utility]
 *     summary: Caller's IP enriched with city, country, timezone, and ISP
 *     responses:
 *       200:
 *         description: Geo + network metadata for the caller's IP (upstream ip-api.com)
 *       502:
 *         description: Upstream geo lookup failed
 */
apiRoutes.get('/geoip', geoip);

/**
 * @swagger
 * /weather:
 *   get:
 *     tags: [Utility]
 *     summary: One-line current weather for the caller's location
 *     description: Resolves caller IP to city, then proxies wttr.in in compact format.
 *     responses:
 *       200:
 *         description: Plain-text weather string (e.g. "Warsaw, +3°C ☁️")
 *       502:
 *         description: Upstream weather lookup failed
 */
apiRoutes.get('/weather', weather);

/**
 * @swagger
 * /qr/{text}:
 *   get:
 *     tags: [Utility]
 *     summary: Render text as an ASCII QR code
 *     parameters:
 *       - in: path
 *         name: text
 *         required: true
 *         schema: { type: string }
 *         description: Text to encode in the QR code
 *     responses:
 *       200:
 *         description: Plain-text QR code rendered with unicode block characters
 */
apiRoutes.get('/qr/:text', qrCode);

/**
 * @swagger
 * /visits:
 *   get:
 *     tags: [Utility]
 *     summary: Increment the global visit counter and return its new value
 *     description: Counter is in-memory and resets when the process restarts.
 *     responses:
 *       200:
 *         description: Object with the new visit count
 */
apiRoutes.get('/visits', visits);

/**
 * @swagger
 * /ua:
 *   get:
 *     tags: [Utility]
 *     summary: Parsed user-agent (browser, OS, device, engine)
 *     responses:
 *       200:
 *         description: Parsed UA object
 */
apiRoutes.get('/ua', userAgent);

/**
 * @swagger
 * /encode64/{value}:
 *   get:
 *     tags: [Utility]
 *     summary: Base64-encode a string
 *     parameters:
 *       - in: path
 *         name: value
 *         required: true
 *         schema: { type: string }
 *         description: String value to be encoded
 *     responses:
 *       200:
 *         description: Base64 encoded result with a decode link
 */
apiRoutes.get('/encode64/:value', encode64);

/**
 * @swagger
 * /decode64/{value}:
 *   get:
 *     tags: [Utility]
 *     summary: Base64-decode a string
 *     parameters:
 *       - in: path
 *         name: value
 *         required: true
 *         schema: { type: string }
 *         description: Base64 string to be decoded
 *     responses:
 *       200:
 *         description: Decoded text result with an encode link
 */
apiRoutes.get('/decode64/:value', decode64);

/**
 * @swagger
 * /verbs:
 *   get:
 *     tags: [Verbs]
 *     summary: Echo endpoint that accepts any HTTP verb
 *     responses:
 *       200: { description: OK }
 *   post:
 *     tags: [Verbs]
 *     responses: { 200: { description: OK } }
 *   put:
 *     tags: [Verbs]
 *     responses: { 200: { description: OK } }
 *   patch:
 *     tags: [Verbs]
 *     responses: { 200: { description: OK } }
 *   delete:
 *     tags: [Verbs]
 *     responses: { 200: { description: OK } }
 */
apiRoutes.get('/verbs', testVerbs);
apiRoutes.post('/verbs', testVerbs);
apiRoutes.put('/verbs', testVerbs);
apiRoutes.patch('/verbs', testVerbs);
apiRoutes.delete('/verbs', testVerbs);
apiRoutes.purge('/verbs', testVerbs);

/**
 * @swagger
 * /status:
 *   get:
 *     tags: [Status codes]
 *     summary: List all supported HTTP status codes
 *     responses:
 *       200:
 *         description: Array of supported statuses with metadata
 * /status/{code}:
 *   parameters:
 *     - in: path
 *       name: code
 *       required: true
 *       schema: { type: integer }
 *       description: HTTP status code to return
 *   get:
 *     tags: [Status codes]
 *     summary: Respond with the requested HTTP status code
 *     responses:
 *       default: { description: Returns the requested status code }
 *   post:
 *     tags: [Status codes]
 *     responses: { default: { description: Returns the requested status code } }
 *   put:
 *     tags: [Status codes]
 *     responses: { default: { description: Returns the requested status code } }
 *   patch:
 *     tags: [Status codes]
 *     responses: { default: { description: Returns the requested status code } }
 *   delete:
 *     tags: [Status codes]
 *     responses: { default: { description: Returns the requested status code } }
 */
apiRoutes.get('/status', httpStatuses);
apiRoutes.get('/status/:code', testStatus);
apiRoutes.post('/status/:code', testStatus);
apiRoutes.put('/status/:code', testStatus);
apiRoutes.patch('/status/:code', testStatus);
apiRoutes.delete('/status/:code', testStatus);

/**
 * @swagger
 * /anythings/{id}:
 *   parameters:
 *     - in: path
 *       name: id
 *       required: true
 *       schema: { type: string }
 *       description: Arbitrary identifier for the stored payload
 *   post:
 *     tags: [Anythings]
 *     summary: Store an arbitrary JSON payload under :id (in-memory, ephemeral)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, additionalProperties: true }
 *     responses:
 *       201: { description: Created }
 *       409: { description: An entry with this id already exists }
 *   get:
 *     tags: [Anythings]
 *     summary: Fetch a previously stored payload
 *     responses:
 *       200: { description: The stored payload }
 *       404: { description: Not found }
 *   put:
 *     tags: [Anythings]
 *     summary: Upsert a payload under :id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, additionalProperties: true }
 *     responses:
 *       201: { description: Created }
 *       202: { description: Updated }
 *   delete:
 *     tags: [Anythings]
 *     summary: Remove the payload at :id
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 * /anythings:
 *   purge:
 *     tags: [Anythings]
 *     summary: Wipe all stored payloads
 *     responses:
 *       410: { description: All entries purged }
 */
apiRoutes.post('/anythings/:id?', postAnything);
apiRoutes.get('/anythings/:id?', getAnything);
apiRoutes.put('/anythings/:id?', putAnything);
apiRoutes.delete('/anythings/:id?', deleteAnything);
apiRoutes.purge('/anythings', purgeAnything);

/**
 * @swagger
 * /upload:
 *   post:
 *     tags: [Utility]
 *     summary: Multipart file upload — returns the uploaded filenames
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200: { description: Array of uploaded filenames }
 *       400: { description: No files provided }
 */
apiRoutes.post('/upload', upload.any(), fileUpload);

/**
 * @swagger
 * /replay:
 *   post:
 *     tags: [Replay]
 *     summary: Push a payload onto the replay queue
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, additionalProperties: true }
 *     responses:
 *       201: { description: Payload enqueued; returns the full queue }
 *   get:
 *     tags: [Replay]
 *     summary: Pop the next payload from the replay queue (FIFO)
 *     responses:
 *       200: { description: The next queued payload }
 *       404: { description: Queue is empty }
 */
apiRoutes.post('/replay', postReplay);
apiRoutes.get('/replay', getReplay);

/**
 * @swagger
 * /delay/{value}:
 *   post:
 *     tags: [Utility]
 *     summary: Return 200 after a configurable delay (ms)
 *     parameters:
 *       - in: path
 *         name: value
 *         required: true
 *         schema: { type: integer }
 *         description: Delay in milliseconds before responding
 *     responses:
 *       200: { description: OK (after the requested delay) }
 */
apiRoutes.post('/delay/:value', postDelay);

/**
 * expose over v1 entrypoint
 */
api.use('/v1', apiRoutes);
module.exports = api;