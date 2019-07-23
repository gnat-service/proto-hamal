const {conf, proto: {getProtoDesc}, statics} = require('./lib');

const {grpc} = conf;
let watchDataPromise;
const getFileCache = (...args) => statics.getFileCache(...args);

let client;

const {storeFile} = statics;

// 本地 protobuf 仓库根目录必须包含 .sum 文件，或者传入一个外部的 .sum buffer。
// 该文件可以仅包含 .proto 文件路径，而不包含 md5sum。每个 .proto 文件路径用回
// 车符分隔
const watch = async (sumfile, batchSize = 10) => {
  sumfile = sumfile || await statics.getSumContent();
  let watchCall;
  const addPromiseFlag = () => {
    const dataPromise = {call: watchCall};
    watchDataPromise = dataPromise;
    watchCall.dataPromise = dataPromise;
    dataPromise.thenable = new Promise((resolve, reject) => {
      dataPromise.resolve = (ret) => {
        if (dataPromise.fulfilled) {
          return;
        }
        resolve(ret);
        dataPromise.resolved = true;
        dataPromise.fulfilled = true;
      };
      dataPromise.reject = (err) => {
        if (dataPromise.fulfilled) {
          return;
        }
        reject(err);
        dataPromise.reject = true;
        dataPromise.fulfilled = true;
      };
    });
  };

  const closeWatch = () => {
    if (watchCall) {
      try {
        watchCall.end();
      } catch (e) {
        // skip
      }
    }
    watchDataPromise = null;
  };

  if (watchDataPromise) {
    await watchDataPromise.thenable; // 只允许同时执行一个 stream pull
    watchCall = watchDataPromise.call;
    addPromiseFlag();
    watchCall.write({sumfile, batchSize}); // 触发一次拉取，提交的非空参数值会修改服务端监听列表和推送量参数
    return watchCall.dataPromise.thenable;
  }

  watchCall = client.watch();
  addPromiseFlag();
  watchCall.write({sumfile, batchSize});
  watchCall.on('data', async ({files, hasMore, isPull}) => {
    const keys = Object.keys(files);
    const pl = keys.map(async filepath => {
      const {error, file} = files[filepath];
      if (error) {
        if (conf.strict) {
          error.stack = error.details;
          return watchCall.dataPromise.reject(error);
        }
        console.error(`Error occurred on file "${filepath}":`, error);
      } else if (file) {
        const {content, sum} = file;
        if (content && sum) {
          await storeFile(filepath, content, sum);
        }
      }
    });
    await Promise.all(pl);
    if (isPull && !hasMore) { // 防止服务端主动推送意外触发 resolve
      watchCall.dataPromise.resolve(watchCall);
    }
  });
  watchCall.on('error', err => console.error(err));
  watchCall.on('end', closeWatch);
  return watchCall.dataPromise.thenable;
};

const fetch = async filepath => {
  const cache = statics.getFileCache(filepath) || {};
  const stream = client.fetch({path: filepath, sum: cache.sum});
  const result = await new Promise((resolve, reject) => {
    const result = {};
    ['data', 'status'].forEach(evt => {
      stream.on(evt, ret => {
        result[evt] = ret;
      });
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(result));
  });

  if (result.status.code || !result.data || !result.data.content) {
    return cache.content;
  }

  const {content, sum} = result.data;
  await storeFile(filepath, content, sum);
  return content;
};
const verifySum = async (filepath) => {
  return new Promise((resolve, reject) => {
    const {sum} = statics.getFileCache(filepath) || {};
    client.verifySum({path: filepath, sum}, (err, res) => {
      if (err) {
        return reject(err);
      }
      resolve(res.match);
    });
  });
};

const getClient = async (_conf = {}) => {
  if (client) {
    return client;
  }

  const config = Object.assign(conf, _conf);
  await statics.initClient(config);
  const proto = grpc.loadPackageDefinition(getProtoDesc(conf)).gnat.hamal.v1;
  client = new proto.Hamal(`${config.host}:${config.port}`, config.clientCredentials, config.channelOptions);

  const close = client.close;
  client.close = function (...args) {
    client = null;
    return close.call(this, ...args);
  };
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
  initClient: getClient,
  getClient,
  getRelativePath: (...args) => statics.getRelativePath(...args),
  fetch,
  watch,
  verifySum,
  getFileCache,
};
