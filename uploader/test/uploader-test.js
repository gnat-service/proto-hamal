const startServer = require('../../server');
const chai = require('chai');
const fs = require('fs');
const path = require('path');
const {md5: {md5Hash}, statics} = require('../lib');
const sinon = require('sinon');
const Client = require('..');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const {expect} = chai;
const protoStaticFilesRoot = path.join(process.cwd(), 'test/static/protos');
const serverProtoStaticRoot = path.join(process.cwd(), '../storage/static/protos');

const helloworld = `
syntax = "proto3";

package helloworld;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}

message HelloRequest {
  string name = 1;
}

message HelloReply {
  string message = 1;
}
`;
const hellocontent = Buffer.from(helloworld);

const testProto = {
  filepath: 'hello/test/helloworld.proto',
  text: helloworld,
  content: hellocontent,
  sum: md5Hash(hellocontent)
};

const clean = async (root) => {
  try {
    fs.unlinkSync(path.join(root, testProto.filepath));
  } catch (e) {
    // skip
  }
  let dirpath = path.dirname(testProto.filepath);
  while (dirpath !== '.') {
    try {
      fs.rmdirSync(path.join(root, dirpath));
    } catch (e) {
      // skip
    }
    dirpath = path.dirname(dirpath);
  }
  await statics.genSum();
};
const store = async (root) => {
  const fullpath = path.join(root, testProto.filepath);
  try {
    fs.mkdirSync(path.dirname(fullpath), {recursive: true});
  } catch (e) {
    // skip
  }
  await statics.storeFile(testProto.filepath, testProto.content);
  try {
    fs.writeFileSync(fullpath, testProto.content);
  } catch (e) {
    // skip
  }
};

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
  beforeEach('initialization', async function () {
    server = await startServer({
      protoStaticFilesRoot: serverProtoStaticRoot
    });

    client = await Client.initClient({protoStaticFilesRoot});
    expectedFileBuf = fs.readFileSync(fullpath);
    expectedSum = md5Hash(expectedFileBuf);
  });

  afterEach('shutdown server', function (done) {
    server.tryShutdown(() => done());
  });

  afterEach('close client', async function () {
    return client.close();
  });

  describe('.upload()', function () {
    beforeEach(function () {
      return store(protoStaticFilesRoot);
    });
    afterEach(async function () {
      await Promise.all([
        clean(serverProtoStaticRoot),
        clean(protoStaticFilesRoot),
        cleanSum()
      ]);
      await server._resetSum();
    });

    it('should update new files', async function () {
      const sumfile = Buffer.from(`${testProto.filepath}:${testProto.sum}`);
      const result = await Client.upload(sumfile);
      expect(result).to.deep.equal({errors: {}, success: 1, update: 1, skipped: 0});
    });

    it('should skip latest files', async function () {
      const sumfile = Buffer.from(`${testProto.filepath}:${testProto.sum}`);
      await Client.upload(sumfile);
      const result = await Client.upload(sumfile);
      expect(result).to.deep.equal({errors: {}, success: 0, update: 0, skipped: 1});
    });

    it('should generate md5sum on server side if the sumfile did not supply one', async function () {
      const sumfile = Buffer.from(`${testProto.filepath}:`);
      const result = await Client.upload(sumfile);
      expect(result).to.deep.equal({errors: {}, success: 1, update: 1, skipped: 0});
    });
  });
});
