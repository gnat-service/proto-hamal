require('./patch');
const path = require('path');
const protoLoader = require('@grpc/proto-loader');

module.exports = {
  getProtoDesc (conf) {
    const PROTO_PATH = path.resolve(__dirname, conf.protoRootDir, 'gnat/hamal/hamal.proto');
    return protoLoader.loadSync(PROTO_PATH, conf.protoLoaderConf);
  }
};
