const {conf, proto: {getProtoDesc}} = require('proto-hamal-server/lib');
const grpc = require('grpc');

process.on('unhandledRejection', err => console.error(err.stack));
process.on('uncaughtException', err => console.error(err.stack));

module.exports = {
  getClient: async (_conf) => {
    Object.assign(conf, _conf);
    const {port, host} = conf;
    const proto = grpc.loadPackageDefinition(getProtoDesc(conf)).gnat.hamal.v1;
    return new proto.Hamal(`${host}:${port}`, grpc.credentials.createInsecure());
  }
};
