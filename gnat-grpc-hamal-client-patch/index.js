const gnatGrpc = require('gnat-grpc');
const HamalClient = require('@server/fireball-proto-hamal-client');

module.exports = async (hamalConf) => {
  if (hamalConf.disableFetcher) {
    return HamalClient;
  }
  await HamalClient.initClient(hamalConf);

  const storageHandler = (filename, options, callback) => {
    if (typeof options === 'function') {
      [options, callback] = [null, options];
    }
    const filepath = HamalClient.getRelativePath(filename);
    const {content} = HamalClient.getFileCache(filepath);
    if (content) {
      callback(null, content.toString('utf8'));
      return;
    }
    // 检查文件是否为最新，如果是，则返回本地文件内容，否则拉取并存储远程文件，然后将其作为结果返回
    return HamalClient
      .fetch(filepath)
      .then(content => callback(null, content.toString('utf8')))
      .catch(callback);
  };
  const storage = {
    handler: (fetch, filename, options, callback) => {
      storageHandler(filename, options, callback);
    }
  };
  gnatGrpc.setProtoFetcher(storage);
  return HamalClient;
};
