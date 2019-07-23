const fs = require('fs');
const PATH = require('path');

const init = (conf) => {
  let cache;

  let protoStaticFullpathCreated = false;
  let existDirs = [];

  const mkdirp = async path => {
    let dir = path;
    const list = [];
    while (!fs.existsSync(dir)) {
      list.unshift(dir);
      dir = PATH.dirname(dir);
    }
    for (let dir of list) {
      await mkdir(dir);
    }
  };
  const mkdirpSync = path => {
    let dir = path;
    const list = [];
    while (!fs.existsSync(dir)) {
      list.unshift(dir);
      dir = PATH.dirname(dir);
    }
    for (let dir of list) {
      fs.mkdirSync(dir);
    }
  };
  const mkdir = path => {
    const e = new Error();
    return new Promise((resolve, reject) => {
      fs.mkdir(path, {recursive: true}, async err => {
        if (err) {
          if (/\bENOENT\b/.test(err.message)) {
            await mkdirp(path);
            return resolve();
          }
          err.message = `Error occurred when creating directory "${path}": ${err.message}`;
          e.message = err.message;
          err.stack = e.stack;
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  const initPkg = async filepath => {
    const filedir = PATH.dirname(filepath);
    if (existDirs.indexOf(filedir) < 0) {
      existDirs.push(filedir);
      const fulldir = getStaticPath(filedir);
      return mkdir(fulldir).catch(() => {});
    }
  };
  const resetCache = () => {
    cache = {protos: {}};
    existDirs = [];
  };

  resetCache();

  const getStaticPath = path => {
    if (!protoStaticFullpathCreated) {
      protoStaticFullpathCreated = true;
      if (PATH.isAbsolute(conf.protoStaticFilesRoot)) {
        conf.protoStaticFullpath = conf.protoStaticFilesRoot;
      } else {
        conf.protoStaticFullpath = PATH.join(conf.cwd, conf.protoStaticFilesRoot);
      }
      try {
        mkdirpSync(conf.protoStaticFullpath);
      } catch (e) {
        // skip
      }
    }
    return PATH.resolve(conf.protoStaticFullpath, path);
  };
  const STATIC_ROOT = getStaticPath('');
  const SUM_PATH = getStaticPath('.sum');
  const getRelativePath = fullpath => {
    if (PATH.isAbsolute(fullpath)) {
      return PATH.relative(STATIC_ROOT, fullpath);
    }
    return fullpath;
  };

  const panic = err => {
    const e = new Error(err.message);
    console.error(e.stack);
    process.exit(1);
  };

  const fileExists = filepath => {
    return cache.protos[filepath];
  };

  const checkExists = filepath => {
    if (!fileExists(filepath)) {
      throw new Error(`file "${filepath}" not found`);
    }
  };

  const cacheSum = (filepath, sum) => {
    cache.protos[filepath] = cache.protos[filepath] || {};
    cache.protos[filepath].sum = sum;
  };

  const cacheFile = (filepath, content) => {
    cache.protos[filepath] = cache.protos[filepath] || {};
    cache.protos[filepath].content = content;
  };

  const writeSumCache = async (lines) => {
    lines = lines || Object.keys(cache.protos).map(filepath => {
      return [filepath, cache.protos[filepath].sum].join(':');
    });
    if (!lines.length) {
      return;
    }
    const content = Buffer.from(lines.join('\n'));
    await mkdir(PATH.dirname(SUM_PATH)).catch(() => {});
    return writeFile(SUM_PATH, content);
  };

  const writeFile = (path, content) =>
    new Promise((resolve, reject) => {
      fs.writeFile(path, content, err => {
        err ? reject(err) : resolve();
      });
    });

  const writeProtoCache = async (filepath, content) => {
    await initPkg(filepath);
    return writeFile(getStaticPath(filepath), content);
  };

  const getFileCache = filepath => cache.protos[filepath];

  const getSumContent = async () =>
    new Promise((resolve) => {
      fs.readFile(SUM_PATH, (err, data) => {
        err ? panic(err) : resolve(data);
      });
    });

  const parseSumContent = async (data, cb) => {
    if (typeof data !== 'string') {
      data = data.toString('utf8');
    }
    const lines = data.split('\n');
    const list = lines.map(async line => {
      line = (line || '').trim();
      if (!line) {
        return;
      }

      let patterns = line.split(':');
      if (patterns.length > 2) {
        patterns = [
          patterns.slice(0, patterns.length - 1).join(':'),
          patterns[patterns.length - 1]
        ];
      }
      [filepath, sum] = patterns;
      if (!filepath) {
        return;
      }
      return cb(filepath, sum);
    });
    return Promise.all(list);
  };

  const parseSumFile = async (cb) => {
    const data = await getSumContent();
    return parseSumContent(data, cb);
  };

  const getStaticProtobuf = (path, cb) =>
    fs.readFile(getStaticPath(path), cb);

  const initTree = async () => {
    if (!fs.existsSync(SUM_PATH)) {
      return;
    }
    await parseSumFile((filepath, sum) =>
      new Promise((resolve) =>
        getStaticProtobuf(filepath, async (err, content) => {
          await initPkg(filepath).catch(() => {});
          if (err) {
            return resolve();
          }
          cacheFile(filepath, content);
          cacheSum(filepath, sum);
          resolve();
        })
      )
    );
    const filepaths = Object.keys(cache.protos);
    filepaths.length && await Promise.all(filepaths.map(initPkg));
  };
  return {
    STATIC_ROOT,
    SUM_PATH,
    panic,
    getSumContent,
    getStaticProtobuf,
    parseSumContent,
    resetCache,
    getStaticPath,
    fileExists,
    checkExists,
    initTree,
    initPkg,
    parseSumFile,
    cacheSum,
    _cache: cache,
    cacheFile,
    getFileCache,
    writeSumCache,
    writeProtoCache,
    getRelativePath
  };
}

module.exports = init;
