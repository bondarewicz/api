const allowed = require('./statuses.json').statuses;
const helpers = require('./helpers.js');
const haiku = require('./haiku.json');
const uaParser = require('ua-parser-js');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const parseString = require('xml2js').parseString;
const qrcodeTerminal = require('qrcode-terminal');

dotenv.config();

let storage = null;
let replayStorage = [];
let visitCount = 0;
const anythings = new Map();

function clientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
  ip = ip.split(',')[0].trim();
  ip = ip.split(':').pop();
  return (ip === '1') ? '127.0.0.1' : ip;
}

function* replayGenerator() {
  
  let index = 0;
  console.log('is it true? : ', replayStorage[index]);
  while(replayStorage[index]) {
    console.log('replayGenerator', replayStorage);
    let temp = replayStorage[index];
    if (index > -1) {
      replayStorage.splice(index, 1);
      console.log('is it?', replayStorage);
    }
    yield temp;
    
  }    
}

module.exports = {
  
  testVerbs: function(req, res) {
    res.status(200).json();
  },

  httpStatuses: function(req, res) {
    
    let body = [];
    let hostname = process.env.API_HOSTNAME || req.protocol + '://' + req.get('host') + req.originalUrl;
    
    allowed.map((s) => {
      body.push({ 
        code:s.code, 
        title: s.title,
        description: s.description,
        link: hostname.replace('statuses', 'status/' + s.code) });
    });
    
    res.json(body);
  },
  
  testStatus: function(req, res) {
    if(allowed.some(status => status.code === req.params.code)) {
      res.status(req.params.code).json();
    } else {
      res.status(405).json();
    }
  },
  
  hello: function(req, res) {
    let time = new Date();
    const dayNames = new Array('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday');
    const greet = dayNames[time.getDay()];

    res.json(`Happy ${greet}!`);
  },
  
  uuid: function(req, res) {
    res.json(helpers.uuid());
  },
  
  ref: function(req, res) {
    let ref = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 36; i++) {
      ref += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    res.json(ref);
  },
  
  version: function(req, res) {
    fetch('https://api.github.com/repos/bondarewicz/com/commits', {
      headers: { 
        'Authorization': `token ${process.env.GITHUB_TOKEN }`,
        'X-GitHub-Api-Version': '2022-11-28'
       }
    })
    .then(res => res.json())
    .then(json => {
      res.json({ url: json[0].html_url, sha: json[0].sha.substr(0, 7) });
    });
  },
  
  haiku: function(req, res) {
    
    let rnd = Math.floor(Math.random() * Math.pow(2,12))
    let name = `${haiku.adjs[rnd%64]}-${haiku.nouns[rnd%64]}-${(Math.floor(Math.random() * (9999 - 1000)) + 1000)}`;

    res.json(name);
  },
  
  // TODO allow passing number of weeks
  sprintName: function(req, res) {
    
    let d = new Date();
    // set to nearest Thursday: current date + 4 - current day number || make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    
    // get first day of year
    let yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    
    // calculate full weeks to nearest Thursday
    let weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

    res.json(`${d.getUTCFullYear()}W${weekNo}`);
  },
  
  hexColor: function(req, res) {
    const hex = Math.floor(Math.random()*16777215).toString(16);
    res.json(`#${hex}`);
  },
  
  ip: async function(req, res) {
    const ip = clientIp(req);
    try {
      const upstream = await fetch(
        `http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,zip,timezone,isp,org,query`
      );
      const data = await upstream.json();
      if (data.status === 'success') {
        return res.json({
          ip: data.query,
          city: data.city,
          region: data.regionName,
          country: data.country,
          countryCode: data.countryCode,
          zip: data.zip,
          timezone: data.timezone,
          isp: data.isp,
          org: data.org,
        });
      }
    } catch (e) { /* fall through to bare IP */ }
    res.json({ ip });
  },

  qrCode: function(req, res) {
    const text = req.params.text || 'https://bondarewicz.com/';
    qrcodeTerminal.generate(text, { small: true }, (qr) => {
      res.type('text/plain').send(qr);
    });
  },

  visits: function(req, res) {
    visitCount += 1;
    res.json({ count: visitCount });
  },

  weather: async function(req, res) {
    const ip = clientIp(req);
    let location = '';
    try {
      const geo = await fetch(`http://ip-api.com/json/${ip}?fields=status,city`);
      const data = await geo.json();
      if (data.status === 'success' && data.city) location = data.city;
    } catch (e) { /* fall through to wttr.in's own geo */ }
    try {
      const url = location
        ? `https://wttr.in/${encodeURIComponent(location)}?format=3`
        : `https://wttr.in/?format=3`;
      const upstream = await fetch(url, { headers: { 'User-Agent': 'curl/7.79' } });
      const text = (await upstream.text()).trim();
      res.type('text/plain').send(text || 'weather unavailable');
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  },
  
  userAgent: function(req, res) {
    
    const ua = uaParser(req.headers['user-agent']);
    const agent = {
      browser: (ua.browser.name !== undefined) ? `${ua.browser.name} ${ua.browser.version}` : ``,
      os: (ua.os.name !== undefined) ? `${ua.os.name} ${ua.os.version}` : ``,
      device: (ua.device.vendor !== undefined) ? `${ua.device.vendor} ${ua.device.model}` : ``,
      engine: (ua.engine.name !== undefined) ? `${ua.engine.name} ${ua.engine.version}` : ``,
      ua: ua.ua
    }
    
    res.json(agent);
  },
  
  // text -> base64
  encode64: function(req, res) {
    let hostname = process.env.API_HOSTNAME || req.protocol + '://' + req.get('host') + req.originalUrl;
    let b = new Buffer(req.params.value);
    let b64string = b.toString('base64');
    
    let body = {
      base64: b64string
    };
    
    let link = hostname.replace(/encode64/i, 'decode64');
    link = link.replace(req.params.value, b64string);
    
    body.links = { "decode": link }
    res.json(body);
  },
  
  // base64 -> text
  decode64: function(req, res) {
    let hostname = process.env.API_HOSTNAME || req.protocol + '://' + req.get('host') + req.originalUrl;
    let b64string = req.params.value;
    let buf = Buffer.from(b64string, 'base64');
    let link = hostname.replace(/decode64/i, 'encode64');
    link = link.replace(req.params.value, buf);
    
    let body = {
      text: buf.toString(),
      links: {
        encode: link
      }
    }
    res.json(body);
  },
  
  purgeAnything: function(req, res) {
    storage = [];
    anythings.clear();
    res.status(410).json();
  },

  postAnything: function(req, res) {

    let hostname = process.env.API_HOSTNAME || req.protocol + '://' + req.get('host') + req.originalUrl;

    if(req.params.id) {

      if(anythings.has(req.params.id)) {
        const error = {
          'status': '409',
          'title':  `Anything with the same id already exists.`,
          'detail':  `Use DELETE ${hostname} first then try again or simply use PUT ${hostname} instead.`
        };
        res.status(409).json(error);
      } else {
        anythings.set(req.params.id, req.body);
        res.status(201).json(req.body);
      }

    } else {

      storage = Object.assign({}, req.body);
      res.status(201).json(storage);
    }
  },

  getAnything: function(req, res) {

    if(req.params.id) {

      if(anythings.has(req.params.id)) {
        res.json(anythings.get(req.params.id));
      } else {
        res.status(404).json();
      }

    } else {
      if(storage) {
        res.status(200).json(storage);
      } else {
        res.status(404).json();
      }
    }
  },

  putAnything: function(req, res) {

    if(req.params.id) {

      const existed = anythings.has(req.params.id);
      anythings.set(req.params.id, req.body);
      res.status(existed ? 202 : 201).json();

    } else {

      storage = Object.assign({}, req.body);
      res.status(202).json(storage);
    }
  },

  deleteAnything: function(req, res) {
    if(req.params.id) {

      if(anythings.delete(req.params.id)) {
        res.status(204).json();
      } else {
        res.status(404).json();
      }

    } else {

      storage = null;
      res.status(200).json(storage);
    }
  },
  
  fileUpload: function(req, res) {
    if(!req.files) {
      res.status(400).json('missing files');
    } else {
      console.log(req.files);
      const names = req.files.map(function(item) {
        return item['originalname'];
      });
      res.status(200).json(names);
    }
  },
  getReplay: function(req, res) {
    let replay = replayGenerator();
    let body = replay.next();

    if(body.value) {
      res.status(200).json(body.value);
    } else {
      res.status(404).json();
    }
  },
  postReplay: function(req, res) {
    replayStorage.push(Object.assign({}, req.body));
    // entity.links = api.get('CRUD');

    res.status(201).json(replayStorage);
  },

  postDelay: function(req, res) {
    var timeout = parseInt(req.params.value);

    setTimeout((() => {
      res.status(200).json();
    }), timeout);
  }
}