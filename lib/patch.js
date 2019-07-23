let protobufjs;
try {
  protobufjs = require('@grpc/proto-loader/node_modules/protobufjs');
} catch (e) {
  protobufjs = require('protobufjs');
}

const resolvePath = protobufjs.Root.prototype.resolvePath;
protobufjs.Root.prototype.resolvePath = function (originPath, includePath, ...args) {
  if (includePath.indexOf('google/protobuf/') === 0) {
    originPath = '';
  }
  return resolvePath.call(this, originPath, includePath, ...args);
};
