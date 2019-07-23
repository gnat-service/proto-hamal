const {getClient} = require('./client');
const startServer = require('../server');
const {statics, md5: {md5Hash}} = require('proto-hamal-server/lib');
const chai = require('chai');
const grpc = require('grpc');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);
const {expect} = chai;
const cwd = process.cwd();
const staticProtoRoot = path.join(cwd, 'static/protos');

const testProto = {
  filepath: 'gnat/test/helloworld.proto',
  content: Buffer.from(`
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
  `)
}

describe('server', function () {
  let server;
  let client;
  let expectedFileBuf;
  let expectedSum;
  const pkg = 'gnat/gnater';
  const filepath = `${pkg}/user.proto`;
  const fullpath = path.join(staticProtoRoot, filepath);
  before('initialization', async function () {
    server = await startServer();
    client = await getClient();
    expectedFileBuf = fs.readFileSync(fullpath);
    expectedSum = md5Hash(expectedFileBuf);
  });
  after('shutdown server', function (done) {
    server.tryShutdown(done);
  });
  after('close client', async function () {
    return client.close();
  });
  describe('.fetch()', function () {
    const fetch = async (path, sum, meta) => {
      const stream = client.fetch({path, sum}, meta);
      const getEmptyFn = () => function () {};

      const dataSpy = sinon.spy(() => {});
      stream.on('data', dataSpy);

      const metadataSpy = sinon.spy(getEmptyFn());
      stream.on('metadata', metadataSpy);

      const statusSpy = sinon.spy(getEmptyFn());
      stream.on('status', statusSpy);

      const errorSpy = sinon.spy(getEmptyFn());

      const endSpy = sinon.spy(getEmptyFn());
      await new Promise(resolve => [
        stream.on('error', function (...args) {
          errorSpy(...args);
          resolve();
        }),
        stream.on('end', function (...args) {
          endSpy.call(this, ...args);
          resolve();
        })
      ]);

      expect(metadataSpy.args[0]).to.with.lengthOf(1);
      expect(metadataSpy.calledOnce).to.equal(true);
      const [metadata] = metadataSpy.args[0];
      expect(metadata).to.be.an.instanceOf(grpc.Metadata);

      return {endSpy, errorSpy, statusSpy, metadataSpy, dataSpy};
    };
    it('should fail when file path cannot be found', async function () {
      const {endSpy, errorSpy, statusSpy, dataSpy} = await fetch('', '');

      expect(endSpy.notCalled).to.equal(true);
      expect(statusSpy.args[0]).to.with.lengthOf(1);
      expect(dataSpy.notCalled).to.equal(true);

      expect(errorSpy.args[0]).to.with.lengthOf(1);

      const [status] = statusSpy.args[0];
      expect(status).to.include({code: 13});
      expect(status).to.have.property('metadata').which.be.an.instanceOf(grpc.Metadata);
      expect(status.metadata.getMap()).to.deep.equal({'x-gnat-ok': 'false', 'x-gnat-error': 'file "" not found'});
    });
    it('should respond file content when file path is stored', async function () {
      const {endSpy, errorSpy, statusSpy, dataSpy} = await fetch(filepath, '');

      expect(endSpy.args[0]).to.with.lengthOf(0);
      expect(errorSpy.notCalled).to.equal(true);
      expect(statusSpy.args[0]).to.with.lengthOf(1);
      expect(dataSpy.args[0]).to.with.lengthOf(1);

      const [status] = statusSpy.args[0];
      expect(status).to.include({code: 0, details: 'OK'});
      expect(status).to.have.property('metadata').which.be.an.instanceOf(grpc.Metadata);
      expect(status.metadata.getMap()).to.deep.equal({'x-gnat-ok': 'true'});

      const [data] = dataSpy.args[0];
      expect(data).to.deep.equal({content: expectedFileBuf, sum: expectedSum});
    });

    it('should success but no file content respond when sum matches', async function () {
      const {endSpy, errorSpy, statusSpy, dataSpy} = await fetch(filepath, expectedSum);

      expect(endSpy.args[0]).to.with.lengthOf(0);
      expect(errorSpy.notCalled).to.equal(true);
      expect(statusSpy.args[0]).to.with.lengthOf(1);
      expect(dataSpy.notCalled).to.equal(true);

      const [status] = statusSpy.args[0];
      expect(status).to.include({code: 0, details: 'OK'});
      expect(status).to.have.property('metadata').which.be.an.instanceOf(grpc.Metadata);
      expect(status.metadata.getMap()).to.deep.equal({'x-gnat-ok': 'true'});
    });

    it('should respond file content even sum matches when specified as force fetching mode', async function () {
      const meta = new grpc.Metadata();
      meta.set('x-gnat-force-fetch', 'true');
      const {endSpy, errorSpy, statusSpy, dataSpy} = await fetch(filepath, expectedSum, meta);

      expect(endSpy.args[0]).to.with.lengthOf(0);
      expect(errorSpy.notCalled).to.equal(true);
      expect(statusSpy.args[0]).to.with.lengthOf(1);
      expect(dataSpy.args[0]).to.with.lengthOf(1);

      const [status] = statusSpy.args[0];
      expect(status).to.include({code: 0, details: 'OK'});
      expect(status).to.have.property('metadata').which.be.an.instanceOf(grpc.Metadata);
      expect(status.metadata.getMap()).to.deep.equal({'x-gnat-ok': 'true'});

      const [data] = dataSpy.args[0];
      expect(data).to.deep.equal({content: expectedFileBuf, sum: expectedSum});
    });
  });

  describe('.watch()', function () {
    let staticCache;
    let sumfileWithoutSums;
    let sumfile;
    let pathsStr;
    let maxCount;
    let call;
    const watch = async (sumfile, batchSize = 0) => {
      let count = 0;
      call.write({sumfile, batchSize});
      const results = [];
      return new Promise((resolve, reject) => {
        call.on('data', data => {
          count++;
          results.push(data);
          if (!data.hasMore) {
            resolve(results);
          }
        });
        call.on('error', err => reject(err));
        call.on('end', () => {
          resolve(results);
        });
      });
    };

    beforeEach(async function () {
      call = client.watch();
      staticCache = statics._staticCache;
      sumfile = await staticCache.getSumContent();
      pathsStr = sumfile.toString().replace(/\:[0-9a-f]+/g, '');
      sumfileWithoutSums = Buffer.from(pathsStr);

      maxCount = pathsStr.split('\n').filter(l => l.trim()).length;
    });
    afterEach(function (done) {
      try {
        call.end(() => done());
      } catch (e) {
        done();
        console.error(e.stack);
      }
    });
    it('should transport uncached files', async function () {
      const results = await watch(sumfileWithoutSums);
      expect(results).to.with.lengthOf(maxCount);
      const pathList = pathsStr.split('\n');
      const files = await Promise.all(
        pathList.map(async (filepath, i) => ({
          files: {
            [filepath]: {
              file: await statics.getProtobuf(filepath),
              error: null
            }
          },
          hasMore: i !== pathList.length - 1,
          isPull: true
        }))
      );
      expect(results).to.have.all.deep.members(files);
    });

    it('should not transport cached files', async function () {
      const results = await watch(sumfile);
      expect(results).to.with.lengthOf(maxCount);
      const pathList = pathsStr.split('\n');
      const files = await Promise.all(
        pathList.map(async (filepath, i) => ({
          files: {
            [filepath]: {
              file: null,
              error: null
            }
          },
          hasMore: i !== pathList.length - 1,
          isPull: true
        }))
      );
      expect(results).to.deep.equal(files);
    });

    it('should support to transport multiple cached files at one time', async function () {
      const lineCount = sumfileWithoutSums.toString().split('\n').filter(s => s.trim()).length;
      const maxCount = Math.ceil(lineCount / 2);
      const results = await watch(sumfileWithoutSums, 2);
      const pathList = pathsStr.split('\n');
      const files = {};
      await Promise.all(
        pathList.map(async filepath => {
          files[filepath] = {
            file: await statics.getProtobuf(filepath),
            error: null
          };
        })
      );

      expect(results).to.with.lengthOf(maxCount);
      const map = {files};
      results.forEach(result => {
        expect(result).to.have.property('files').which.to.be.an('Object');
        Object.assign(map.files, result.files);
        const keys = Object.keys(result.files);
        expect(keys.length).to.gte(1);
      });
      expect(map).to.deep.equal({files});
    });

    it('should support to transport files after truck loading time out', async function () {
      maxCount = 1;
      const results = await watch(sumfileWithoutSums, 3);
      expect(results).to.with.lengthOf(maxCount);
      const pathList = pathsStr.split('\n');
      const files = {};
      await Promise.all(
        pathList.map(async filepath => {
          files[filepath] = {
            file: await statics.getProtobuf(filepath),
            error: null
          };
        })
      );
      expect(results).to.deep.equal([{files, hasMore: false, isPull: true}]);
    });

    it('should support to respond multiple times', async function () {
      const nonexists = 'gnat/nonexists/any.proto';
      const str = `${pathsStr}\n${nonexists}`;
      maxCount = 2;
      const results = await watch(Buffer.from(str), 2);
      await watch(Buffer.from(str), 2);
      expect(results).to.with.lengthOf(maxCount * 2);
      results.forEach(result => {
        expect(result).to.have.property('files').which.to.be.an('object');
      });
      expect(results.map(({files}) => Object.keys(files).length)).to.deep.equal([2, 2, 2, 2]);
    });
  });

  describe('.verifySum()', function () {
    const verifySum = async (path, sum) => {
      return new Promise((resolve, reject) => {
        client.verifySum({path, sum}, (err, ret) => {
          err ? reject(err) : resolve(ret);
        });
      });
    };
    it('should reject when assigned file cannot be found', async function () {
      return expect(verifySum('')).to.eventually.rejectedWith('file "" not found');
    });

    it('should indicate unmatched state when sum not matches', async function () {
      const ret = await verifySum(filepath);
      expect(ret).to.deep.equal({match: false});
    });

    it('should indicate matched state when sum matches', async function () {
      const ret = await verifySum(filepath, expectedSum);
      expect(ret).to.deep.equal({match: true});
    });
  });
});
