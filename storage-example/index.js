const startServer = require('./server');

startServer({protoStaticFilesRoot: process.env.STATIC_PROTO_ROOT || '/protos'}).catch(e => {
  console.error(e.stack);
  process.exit(1);
});
