const {conf, proto: {getProtoDesc}, statics} = require('./lib');

const getFileCache = (...args) => statics.getFileCache(...args);

const {grpc} = conf;
let client;
const wrapClient = client => {
  const close = client.close;
  client.close = function () {
    close.call(this);
  };
};

// 本地 protobuf 仓库根目录必须包含 .sum 文件，或者传入一个外部的 .sum buffer。
// 该文件中必须同时包含 .proto 文件路径和对应的 md5sum
const upload = async (sumfile) => {
  sumfile = sumfile || await statics.getSumContent();
  const {matched, errors, unmatched, additional} = await new Promise((resolve, reject) => {
    client.compareSums({sumfile}, (err, ret) => {
      err ? reject(err) : resolve(ret);
    });
  });

  if (errors) {
    const files = Object.keys(errors);
    if (files.length) {
      const message = files.map(filepath => {
        console.error(errors[filepath]);
        return errors[filepath].message;
      }).join('\n');
      throw new Error(message);
    }
  }
  const uploadList = [...(unmatched || []), ...(additional || [])];
  if (!uploadList.length) {
    return {errors, success: 0, update: 0, skipped: matched};
  }

  const ret = await new Promise((resolve, reject) => {
    const call = client.upload((err, ret) => {
      err ? reject(err) : resolve(ret);
    });

    uploadList.forEach(filepath => {
      const data = {
        files: {
          [filepath]: getFileCache(filepath)
        }
      };
      call.write(data);
    });
    call.end();
  });
  if (ret.errors) {
    ret.errors = Object.assign(errors, ret.errors);
  }
  ret.skipped = matched;
  return ret;
};

const initClient = async (_conf = {}) => {
  const config = Object.assign(conf, _conf);
  await statics.initUploader(config);
  const proto = grpc.loadPackageDefinition(getProtoDesc(conf)).gnat.hamal.v1;
  client = new proto.Hamal(`${config.host}:${config.port}`, config.clientCredentials, conf.channelOptions);
  wrapClient(client);
  return client;
};

module.exports = {
  get _staticCache () {
    return statics._staticCache;
  },
  get _conf () {
    return conf;
  },
  _resetCache (...args) {
    statics._staticCache.resetCache(...args);
  },
  initClient,
  upload,
  getFileCache,
};
