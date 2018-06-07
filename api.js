const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const fetch = require('node-fetch');
const uaParser = require('ua-parser-js');
const dotenv = require('dotenv');
const haiku = require('./haiku.json');
const statuses = require('./statuses.json').statuses;
const helpers = require('./helpers.js');
// 
const apiRoutes = express.Router();
const api = express();

/**
 * Load env configuration
 */
dotenv.config();

api.set('adjs', haiku.adjs);
api.set('nouns', haiku.nouns);

/**
 * middlewares
 */
let setHostname = (req, res, next) => {
  api.set('API_HOSTNAME', process.env.API_HOSTNAME || req.protocol + '://' + req.get('host') + req.originalUrl);
  next()
}

api.use(setHostname);

let crudLinks = (req, res, next) => {
  
  api.set('CRUD', {
    'get': api.get('API_HOSTNAME'),
    'post': api.get('API_HOSTNAME'),
    'put': api.get('API_HOSTNAME'),
    'delete': api.get('API_HOSTNAME')
  });

  next();
}

let statusLinks = (req, res, next) => {
  
  let st = {};
  const m = req.method;
  
  statuses.map((s) => {
    let c = Object.keys(s)[0];
    st[c] = api.get('API_HOSTNAME').replace('statuses', 'status/'+c)
    console.log('->', Object.keys(s)[0]);
  })
  api.set('CODES', st);

  next();
};

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
api.enable('trust proxy');

api.use((req, res, next) => {
  // http://jsonapi.org/
  res.setHeader('Content-Type', 'application/vnd.api+json');
  
  // cors
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

api.use(morgan('dev'));

/**
 * use body parser so we can handle both POST and/or URL parameters
 * suports both application/x-www-form-urlencoded & application/json
 */
api.use(bodyParser.urlencoded({extended: true}));
api.use(bodyParser.json());

/**
 * http verbs
 */
apiRoutes.get('/get', (req, res) => {
  res.status(200).json();
});

apiRoutes.post('/post', (req, res) => {
  res.status(201).json();
});

apiRoutes.put('/put', (req, res) => {
  res.status(202).json();
});

apiRoutes.patch('/patch', (req, res) => {
  res.status(202).json();
});

apiRoutes.delete('/delete', (req, res) => {
  res.status(204).json();
});

apiRoutes.get('/statuses', statusLinks, (req, res) => {
  console.log(api.get('CODES'));
  const body = {
    codes: Object.assign([], statuses),
    links: api.set('CODES')
  }
  
  // body.links = api.set('CODES');
  res.json(body);
});
/**
 * http status codes
 */
apiRoutes.get('/status/:code', (req, res) => {
  if(req.params.code) {
    res.status(req.params.code).json();
  } else {
    res.status(200).json();
  }
});

apiRoutes.post('/status/:code', (req, res) => {
  if(req.params.code) {
    res.status(req.params.code).json();
  } else {
    res.status(201).json();
  }
});

apiRoutes.put('/status/:code', (req, res) => {
  if(req.params.code) {
    res.status(req.params.code).json();
  } else {
    res.status(202).json();
  }
});

apiRoutes.patch('/status/:code', (req, res) => {
  if(req.params.code) {
    res.status(req.params.code).json();
  } else {
    res.status(202).json();
  }
});

apiRoutes.delete('/status/:code', (req, res) => {
  if(req.params.code) {
    res.status(req.params.code).json();
  } else {
    res.status(204).json();
  }
});

/**
 * return anything
 */
apiRoutes.post('/anything/:id?', crudLinks, (req, res) => {
  
  let anything = null;
  
  if(req.params.id) {
    
    const entity = Object.assign({ id : req.params.id }, req.body);
    entity.links = api.get('CRUD');
    
    api.set(req.params.id, entity);
    anything = api.get(req.params.id);
  } else {
    
    const entity = Object.assign({}, req.body);
    entity.links = api.get('CRUD');
    
    api.set('anything', entity);
    anything = api.get('anything');
  }
  
  res.status(201).json(anything);
});

apiRoutes.get('/anything/:id?', (req, res) => {
  
  let anything = null;
  
  if(req.params.id) {
    anything = api.get(req.params.id);
  } else {
    anything = api.get('anything');
  }
  
  if(anything) {
    res.status(200).json(anything);
  } else {
    res.status(404).json();
  }
  
});

apiRoutes.put('/anything/:id?', crudLinks, (req, res) => {
  
  let anything = null;
  
  if(req.params.id) {
    const entity = Object.assign({ id : req.params.id }, req.body);
    entity.links = api.get('CRUD');
    
    api.set(req.params.id, entity);
    anything = api.get(req.params.id);
  } else {
    const entity = Object.assign({}, req.body);
    entity.links = api.get('CRUD');
    
    api.set('anything', entity);
    anything = api.get('anything');
  }
  res.status(202).json(anything);
});

apiRoutes.delete('/anything/:id?', (req, res) => {
  if(req.params.id) {
    api.set(req.params.id, null);
  } else {
    api.set('anything', null);  
  }
  
  res.status(204).json();
});
 
/**
 * friendly greeting
 */
apiRoutes.get('/hello', (req, res) => {
  let time = new Date();
  const dayNames = new Array('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday');
  const greet = dayNames[time.getDay()];

  res.json(`Happy ${greet}!`);
});

/**
 * uuid v4
 */
apiRoutes.get('/uuid', (req, res) => {
  res.json(helpers.uuid());
});

/**
 * unique "enough" ref
 */
apiRoutes.get('/ref', (req, res) => {
  let ref = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < 36; i++) {
    ref += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  res.json(ref);
});

/**
 * heroku inspired "haiku" project name
 */
apiRoutes.get('/haiku', (req, res) => {
  
  let rnd = Math.floor(Math.random() * Math.pow(2,12))
  let haiku = `${api.get('adjs')[rnd%64]}-${api.get('nouns')[rnd%64]}-${(Math.floor(Math.random() * (9999 - 1000)) + 1000)}`;

  res.json(haiku);
});

/**
 * week of the year sprint name
 * @todo allow passing number of weeks
 */
apiRoutes.get('/sprint', (req, res) => {
  
  let d = new Date();
  // set to nearest Thursday: current date + 4 - current day number || make Sunday's day number 7
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  // get first day of year
  let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // calculate full weeks to nearest Thursday
  let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

  res.json(`${d.getUTCFullYear()}W${weekNo}`);
});

/**
 * hex color
 */
apiRoutes.get('/hex', (req, res) => {
  const hex = Math.floor(Math.random()*16777215).toString(16);
  res.json(`#${hex}`);
});

/**
 * ipv4
 *
 * TODO GET https://api.ipify.org/?format=json
 */
apiRoutes.get('/ip', (req, res) => {
  
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  ip = ip.split(':').pop();
  ip = (ip === '1') ? '127.0.0.1' : ip;
  res.json(ip);
});

/**
 * parse user agent details
 */
apiRoutes.get('/ua', (req, res) => {
  
  const ua = uaParser(req.headers['user-agent']);
  const agent = {
    ua: ua.ua,
    browser: (ua.browser.name !== undefined) ? `${ua.browser.name} ${ua.browser.version}` : ``,
    engine: (ua.engine.name !== undefined) ? `${ua.engine.name} ${ua.engine.version}` : ``,
    os: (ua.os.name !== undefined) ? `${ua.os.name} ${ua.os.version}` : ``,
    device: (ua.device.vendor !== undefined) ? `${ua.device.vendor} ${ua.device.model}` : ``
  }
  
  res.json(agent);
});

/**
 * text -> base64
 */
apiRoutes.get('/encode64/:value', (req, res) => {
  var b = new Buffer(req.params.value);
  var b64string = b.toString('base64');
  
  let body = {
    base64: b64string
  };
  
  let link = api.get('API_HOSTNAME')(/encode64/i, 'decode64');
  link = link.replace(req.params.value, b64string);
  
  body._links = {
    "next": {
      "href": link
    }
  }
  
  res.json(body);
});

/**
 * base64 -> text
 */
apiRoutes.get('/decode64/:value', (req, res) => {
  let b64string = req.params.value;
  let buf = Buffer.from(b64string, 'base64');
  
  res.json(buf.toString());
});

/**
 * expose over api entrypoint
 */
api.use('/', apiRoutes);
module.exports = api;