const startServer = require('../../server');
const chai = require('chai');
const fs = require('fs');
const path = require('path');
const {md5: {md5Hash}} = require('../lib');
const sinon = require('sinon');
const Client = require('..');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const {expect} = chai;
const protoStaticFilesRoot = path.join(process.cwd(), 'test/static/protos');
const serverProtoStaticRoot = path.join(process.cwd(), '../storage/static/protos');

process.on('unhandledRejection', err => console.error(err.stack));
process.on('uncaughtException', err => console.error(err.stack));

describe('client', function () {
  let client;
  let server;
  let expectedFileBuf;
  let expectedSum;
  const sumExists = () => fs.existsSync(Client._staticCache.SUM_PATH);
  const filepath = 'gnat/gnater/user.proto';
  const fullpath = path.join(serverProtoStaticRoot, filepath);
  const deleteSumFile = () =>
    fs.existsSync(Client._staticCache.SUM_PATH) &&
      fs.unlinkSync(Client._staticCache.SUM_PATH);
  const cleanSum = () => {
    deleteSumFile();
    Client._resetCache();
  };
  beforeEach(async function () {
    console.log('initializing client')
    server = await startServer({
      protoStaticFilesRoot: serverProtoStaticRoot
    });
    client = await Client.getClient({protoStaticFilesRoot});
    expectedFileBuf = fs.readFileSync(fullpath);
    expectedSum = md5Hash(expectedFileBuf);
  });

  afterEach('shutdown server', function (done) {
    server.tryShutdown(() => done());
  });

  afterEach('close client', async function () {
    return client.close();
  });

  afterEach('clear temp files', async function () {
    if (!fs.existsSync(Client._staticCache.SUM_PATH)) {
      return;
    }
    const deleted = [];
    await Client._staticCache.parseSumFile((filepath) => {
      const fullpath = Client._staticCache.getStaticPath(filepath);
      let dir = path.dirname(fullpath);

      do {
        if (deleted.indexOf(dir) < 0) {
          deleted.push(dir);
          fs.readdirSync(dir).forEach(file => {
            const fullpath = path.join(dir, file);
            fs.unlinkSync(fullpath);
          });
          try {
            fs.rmdirSync(dir);
          } catch (e) {
            console.error(e.stack)
            break;
          }
        }
        dir = path.dirname(dir);
      } while (/\/test\/static\b/.test(dir));
    });
    cleanSum();
  });

  describe('.fetch()', function () {
    let spy;
    let staticCache;
    beforeEach(async function () {
      staticCache = Client._staticCache;
      spy = sinon.spy(staticCache, 'writeSumCache');
    });
    afterEach(async function () {
      spy.restore();
    });
    it('should fetch single file from remote and then cache it', async function () {
      expect(sumExists()).to.equal(false);
      const content = await Client.fetch(filepath);
      const [p] = spy.returnValues;
      await p;
      expect(sumExists()).to.equal(true);
      const file = fs.readFileSync(Client._staticCache.getStaticPath(filepath));
      const cached = Client._staticCache.getFileCache(filepath).content;
      expect(cached).to.deep.equal(expectedFileBuf);
      expect(file).to.deep.equal(expectedFileBuf);
      expect(md5Hash(file)).to.equal(expectedSum);
      expect(content).to.deep.equal(expectedFileBuf);
    });

    it('should reject when specified filepath cannot be found', async function () {
      return expect(Client.fetch('')).to.eventually.rejectedWith(/\bError\: file "" not found/);
    });
  });

  describe('.watch()', function () {
    let sumfileTxt;
    let sumfile;
    let batchSize = 1;
    let watchPromise;
    beforeEach(async function () {
      sumfileTxt = filepath;
      sumfile = Buffer.from(sumfileTxt);
      watchPromise = Client.watch(sumfile, batchSize);
    });

    afterEach(async function () {
      (await watchPromise).end();
    });

    it('should pull proto files from remote to local path', async function () {
      await watchPromise;
      expect(sumExists()).to.equal(true);
      const file = fs.readFileSync(Client._staticCache.getStaticPath(filepath));
      const cached = Client._staticCache.getFileCache(filepath).content;
      expect(cached).to.deep.equal(expectedFileBuf);
      expect(file).to.deep.equal(expectedFileBuf);
      expect(md5Hash(file)).to.equal(expectedSum);
    });

    it('should indicate error but still transports the rest files by default', async function () {
      const nonexists = 'nonexists/some.proto';
      const buf = Buffer.from(`${sumfileTxt}\n${nonexists}`);
      await Client.watch(buf, 2);

      expect(sumExists()).to.equal(true);
      const file = fs.readFileSync(Client._staticCache.getStaticPath(filepath));
      const cached = Client._staticCache.getFileCache(filepath).content;
      expect(cached).to.deep.equal(expectedFileBuf);
      expect(file).to.deep.equal(expectedFileBuf);
      expect(md5Hash(file)).to.equal(expectedSum);
    });

    it('should reject error when `conf.strict` is true', async function () {
      Client._conf.strict = true;
      const nonexists = 'nonexists/some.proto';
      const buf = Buffer.from(`${sumfileTxt}\n${nonexists}`);
      await expect(Client.watch(buf, 2)).to.eventually.rejectedWith('file nonexists/some.proto not exists.');
      Client._conf.strict = false;
    });

    it('should ignore latest proto files', async function () {
      const assertFiles = (types, user) => {
        expect(fs.existsSync(Client._staticCache.getStaticPath('gnat/gnater/types.proto'))).to.equal(types);
        expect(fs.existsSync(Client._staticCache.getStaticPath(filepath))).to.equal(user);
      };
      assertFiles(false, false);
      await watchPromise;
      assertFiles(false, true);
      const sumfile = fs.readFileSync(path.join(serverProtoStaticRoot, '.sum'));
      await Client.watch(sumfile, 2);
      assertFiles(false, true);
    });
  });

  describe('.verifySum()', function () {
    it('should return false when sum not matches', async function () {
      const ret = await Client.verifySum(filepath);
      expect(ret).to.equal(false);
    });
    it('should return true when sum matches', async function () {
      await Client.fetch(filepath);
      const ret = await Client.verifySum(filepath);
      expect(ret).to.equal(true);
    });
  });
});
