const allowed = require('./statuses.json').statuses;
const helpers = require('./helpers.js');
const haiku = require('./haiku.json');
const uaParser = require('ua-parser-js');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const mongo = require('mongodb').MongoClient;
const parseString = require('xml2js').parseString;

dotenv.config();

let storage = null;
let db;

let url = `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_ENDPOINT}:${process.env.MONGO_PORT}/${process.env.MONGO_DB}`
mongo.connect(url, (err, client) => {
  if (err) return console.log(err);
  db = client.db(process.env.MONGO_DB);
});

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
  
  contributions: function(req, res) {
    fetch('https://github.com/users/bondarewicz/contributions', {
      headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN }` }
    })
    .then(res => res.text())
	   .then(body => {
       
       parseString(body, function (err, result) {
         let contributions = result.div.div[0].h2[0]._.replace(/(\r\n\t|\n|\r\t)/gm,'').trim();
         //
         res.json(`${contributions}`);
       });
     });
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
      headers: { 'Authorization': `token ${process.env.GITHUB_TOKEN }` }
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
  
  // TODO GET https://api.ipify.org/?format=json
  ip: function(req, res) {
    
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    ip = ip.split(':').pop();
    ip = (ip === '1') ? '127.0.0.1' : ip;
    res.json(ip);
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
    
    storage = null;
    
    db.collection('anythings').remove({}, function(err, result){
      if (err) throw err;
      res.status(410).json();
    });
  },
  
  postAnything: function(req, res) {
    
    let hostname = process.env.API_HOSTNAME || req.protocol + '://' + req.get('host') + req.originalUrl;
    let anything = null;
    
    if(req.params.id) {
      
      db.collection('anythings').find({ref: req.params.id}).limit(1).toArray((err, anythings) => {
        if ( anythings.length > 0) {
          
          const error = {
            'status': '409',
            'title':  `Anything with the same id already exists.`,
            'detail':  `Use DELETE ${hostname} first then try again or simply use PUT ${hostname} instead.`
          };
          
          res.status(409).json(error);
          
        } else {
          
          db.collection('anythings').insertOne({ 'ref': req.params.id, 'body': req.body }, (err, recs) => {
             if(err) throw err;
             res.status(201).json(recs.ops[0].body);
          });
          
        }
      });
      
    } else {
    
      storage = Object.assign({}, req.body);
      // entity.links = api.get('CRUD');

      res.status(201).json(storage);
    }
  },
  
  getAnything: function(req, res) {
    
    if(req.params.id) {
      
      db.collection('anythings').find({ 'ref': req.params.id }).limit(1).toArray((err, anythings) => {
        if(err) throw err;
        
        if(anythings.length > 0) {
          res.json(anythings[0].body);
        } else {
          res.status(404).json();
        } 
      });
      
    } else {
      res.status(200).json(storage);
    }
    
  },
  
  putAnything: function(req, res) {
    
    if(req.params.id) {
      
      db.collection('anythings').updateOne({'ref': req.params.id}, {$set: {'body': req.body}}, { upsert: true }, (err, anythings) => {
        if(err) throw err;
          
        if(anythings.modifiedCount) {
          res.status(202).json();
        } else {
          res.status(304).json();
        }
      });
      
    } else {
      
      storage = Object.assign({}, req.body);
      // entity.links = api.get('CRUD');
      res.status(202).json(storage);
    }
    
  },
  
  deleteAnything: function(req, res) {
    if(req.params.id) {
      
      db.collection('anythings').deleteOne({'ref': req.params.id}, (err, anythings) => {
          if(err) throw err;
          
          if(anythings.deletedCount) {
            res.status(204).json();
          } else {
            res.status(404).json();
          }
      });
      
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
  }
}