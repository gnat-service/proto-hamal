const conf = require('proto-hamal-tools/conf');
const path = require('path');

let grpc;
try {
  grpc = require('@grpc/grpc-js');
} catch (e) {
  grpc = require('grpc');
}

module.exports = Object.assign({}, conf, {
  host: process.env.HOST || 'localhost',
  cwd: path.resolve(__dirname, '..'),
  clientCredentials: grpc.credentials.createInsecure(),
  grpc,
});
