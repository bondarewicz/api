const dotenv = require('dotenv');
const api = require('./api');
dotenv.config();
const port = process.env.PORT || 80;

api.listen(port, () => {
  console.log(`api listening on port ${port}`);
});
