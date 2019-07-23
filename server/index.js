const grpc = require('grpc');
const {statics, proto: {getProtoDesc}, conf: defaultConf, initHamal} = require('./lib');

const Hamal = initHamal({
  entryExists: (...args) => statics.fileExists(...args),
  isLatestCargo: (...args) => statics.verifySum(...args),
  readOrder (cb) {
    return statics.parseSumContent(this.order, cb);
  },
  getCargo: statics.getProtobuf
});
const getReqMetadata = call => {
  const map = call.metadata.getMap();
  return {
    force: map['x-gnat-force-fetch'] === 'true',
  };
};

const watch = async (trailer, call) => {
  Hamal.hireHamal(call);
};

const fetch = async (trailer, call) => {
  const {path, sum} = call.request;
  const {force} = getReqMetadata(call);
  statics.checkExists(path);

  if (!force && sum && statics.verifySum(path, sum)) {
    return null;
  }

  return statics.getProtobuf(path);
};

const upload = (trailer, call, callback) => {
  const result = {success: 0, update: 0, errors: {}};
  const pl = [];
  call.on('data', async (data) => {
    let r;
    pl.push(new Promise(resolve => {r = resolve;}));
    const {files = {}} = data || {};
    const {errors} = result;
    const _fileHandler = async filepath => {
      const file = files[filepath];
      const {content} = file;
      const sum = file.sum || statics.md5Hash(content);
      if (statics.fileExists(filepath) && statics.verifySum(filepath, sum)) {
        result.success++;
        return;
      }

      const fileData = await statics.storeFile(filepath, content);
      result.success++;
      result.update++;
      return fileData;
    };
    const fileHandler = async filepath => {
      try {
        return await _fileHandler(filepath);
      } catch (e) {
        e.details = e.stack;
        errors[filepath] = e;
      }
    };
    const storedFiles = await Promise.all(
      Object.keys(files).map(fileHandler)
    );

    Hamal.distribute(storedFiles.filter(f => f));
    r();
  });

  call.on('end', async () => {
    await Promise.all(pl);
    callback(null, result);
  });
};

const compareSums = async (trailer, call) => {
  const {sumfile, sumfileString} = call.request;
  const result = {matched: 0, unmatched: [], additional: [], errors: {}};
  await statics.parseSumContent(sumfileString || sumfile, (filepath, sum) => {
    if (!statics.fileExists(filepath)) {
      result.additional.push(filepath);
    } else if (!sum) {
      result.errors[filepath] = new Error(`should specify sum string for file "${filepath}".`);
    } else if (statics.verifySum(filepath, sum)) {
      result.matched++;
    } else {
      result.unmatched.push(filepath);
    }
  });

  return result;
};

const verifySum = (trailer, call) => {
  const {sum, path} = call.request;
  const match = statics.verifySum(path, sum);
  return {match};
};

const methods = {fetch, verifySum, watch, upload, compareSums};
Object.keys(methods).forEach(name => {
  const fn = methods[name];
  methods[name] = async function (...args) {
    const [call, cb] = args;
    const meta = new grpc.Metadata();
    let ret;
    let err;
    try {
      ret = await fn.call(this, meta, ...args);
    } catch (e) {
      err = e;
      err.code = grpc.status.INTERNAL;
      err.details = err.stack;
      err.metadata = meta;
    }

    let flag = 'false';
    if (err) {
      meta.set('x-gnat-error', err.message);
    } else {
      flag = 'true';
    }
    meta.set('x-gnat-ok', flag);

    if (args.length === 1) {
      if (err) {
        call.emit('error', err);
      } else if (ret !== undefined) {
        ret && call.write(ret);
        call.end(meta);
      }
    } else if (err || ret !== undefined) {
      cb(err, ret, meta);
    }
  }
});

const start = async conf => {
  conf = Object.assign(defaultConf, conf);
  const proto = grpc.loadPackageDefinition(getProtoDesc(conf)).gnat.hamal.v1;
  let {server} = conf;
  await statics.init(conf);
  if (!server) {
    server = new grpc.Server();
    server.addService(proto.Hamal.service, methods);
    server.bind(`${conf.host}:${conf.port}`, conf.serverCredentials);
    console.log(`Server started.`);
    server.start();
  } else {
    server.addService(proto.Hamal.service, methods);
  }
  server._resetSum = statics.genSum;
  return server;
};

module.exports = start;
