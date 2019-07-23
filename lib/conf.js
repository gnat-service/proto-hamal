const path = require('path');

const cwd = path.resolve(__dirname, '..');
module.exports = {
  cwd,
  protoRootDir: '.proto',
  port: process.env.PORT || '50052',
  host: process.env.HOST || '0.0.0.0',
  protoStaticFilesRoot: 'static/protos',
  protoLoaderConf: {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  }
};
