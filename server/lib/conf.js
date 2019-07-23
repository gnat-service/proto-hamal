const conf = require('proto-hamal-tools/conf');
const path = require('path');
const grpc = require('grpc');

module.exports = Object.assign({}, conf, {
  host: process.env.HOST || '0.0.0.0',
  cwd: path.resolve(__dirname, '..'),
  serverCredentials: grpc.ServerCredentials.createInsecure(),
});
