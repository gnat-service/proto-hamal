const fs = require('fs');
const PATH = require('path');
const glob = require('glob');
const {md5Sum, md5Hash} = require('./md5-sum');
const getStaticCache = require('./static-cache');

let staticCache;

const getStaticProtobuf = (path, cb) =>
  staticCache.getStaticProtobuf(path, cb);

const getStaticProtoList = cb => {
  const globPattern = PATH.join(staticCache.STATIC_ROOT, '**/*.proto');
  glob(globPattern, cb);
};

const getFileSum = filepath => {
  staticCache.checkExists(filepath);
  const fileCache = staticCache.getFileCache(filepath);
  return fileCache.sum;
};

const verifySum = (filepath, sum) => {
  return sum === getFileSum(filepath);
};

const getProtobuf = (filepath) => {
  staticCache.checkExists(filepath);
  return new Promise((resolve, reject) => {
    const fileCache = staticCache.getFileCache(filepath);
    if (fileCache.content) {
      return resolve(fileCache.content);
    }
    const fullpath = staticCache.getStaticPath(filepath);
    getStaticProtobuf(fullpath, (err, data) => {
      err ? reject(err) : resolve(data);
    });
  })
    .then(content => {
      const sum = getFileSum(filepath);
      staticCache.cacheFile(filepath, content);
      return {sum, content};
    });
};

const genSum = () => {
  return new Promise(resolve =>
    getStaticProtoList((err, list) => {
      err && staticCache.panic(err);
      resolve(
        Promise.all(
          list.map(async fullpath => {
            const filepath = staticCache.getRelativePath(fullpath);
            const content = await new Promise(resolve => {
              staticCache.getStaticProtobuf(fullpath, (err, ret) => {
                err && staticCache.panic(err);
                resolve(ret);
              });
            });
            const sum = md5Hash(content);
            return [filepath, sum, content];
          })
        )
      )
    })
  )
    .then(lines => {
      staticCache.resetCache();
      lines = lines.map(([filepath, sum, content]) => {
        content && staticCache.cacheFile(filepath, content);
        staticCache.cacheSum(filepath, sum);
        return [filepath, sum].join(':');
      });
      return staticCache.writeSumCache(lines);
    });
};

const storeFile = async (filepath, content) => {
  const sum = md5Hash(content);
  staticCache.cacheSum(filepath, sum);
  staticCache.cacheFile(filepath, content);
  await staticCache.writeProtoCache(filepath, content);
  await genSum();
  return {filepath, content, sum};
};

const parseSumFile = (...args) => staticCache.parseSumFile(...args);
const parseSumContent = (...args) => staticCache.parseSumContent(...args);

const initSum = () => {
  if (fs.existsSync(staticCache.SUM_PATH)) {
    return parseSumFile((filepath, sum) => {
      staticCache.cacheSum(filepath, sum);
    });
  }
  return genSum().catch(staticCache.panic);
};

const initStorage = (conf) => {
  staticCache = getStaticCache(conf);
  return initSum();
};

const initClient = conf => {
  staticCache = getStaticCache(conf);
  return staticCache.initTree();
};

const initUploader = conf => {
  staticCache = getStaticCache(conf);
  return genSum();
};

const init = (conf) => {
  return initStorage(conf);
};

const getFileCache = (...args) => staticCache.getFileCache(...args);
const fileExists = (...args) => staticCache.fileExists(...args);
const checkExists = (...args) => staticCache.checkExists(...args);
const initPkg = (...args) => staticCache.initPkg(...args);
const getSumContent = (...args) => staticCache.getSumContent(...args);
const getRelativePath = (...args) => staticCache.getRelativePath(...args);

module.exports = {
  get _staticCache () {
    return staticCache;
  },
  genSum,
  parseSumContent,
  getSumContent,
  verifySum,
  md5Hash,
  fileExists,
  checkExists,
  getProtobuf,
  getFileSum,
  getRelativePath,
  getFileCache,
  init,
  initClient,
  initUploader,
  initStorage,
  initPkg,
  storeFile,
};
