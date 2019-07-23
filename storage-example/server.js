const startServer = require('proto-hamal-server');
const path = require('path');

const protoStaticFilesRoot = path.join(process.cwd(), 'static/protos');

module.exports = (conf) =>
  startServer(Object.assign({protoStaticFilesRoot}, conf));
