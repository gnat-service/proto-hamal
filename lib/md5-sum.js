const fs = require('fs');
const crypto = require('crypto');

const md5Hash = (str, encoding = 'hex') => {
  const hash = crypto.createHash('md5');
  hash.update(str);
  return hash.digest(encoding);
};

const md5Sum = (filepath, opts, cb) => {
  if (typeof opts === 'function') {
    [opts, cb] = [null, opts];
  }
  fs.readFile(filepath, opts, (err, content) => {
    if (err) {
      return cb(err);
    }
    cb(null, md5Hash(content));
  });
};

const md5SumSync = (filepath, opts) => {
  const content = fs.readFileSync(filepath, opts);
  return md5Hash(content);
};

module.exports = {
  md5Hash,
  md5Sum,
  md5SumSync
};
