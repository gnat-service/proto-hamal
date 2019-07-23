const lib = require('proto-hamal-tools');
const conf = require('./conf');
const initHamal = require('./hamal');

lib.conf = conf;
lib.initHamal = initHamal;

module.exports = lib;
