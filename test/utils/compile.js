const path = require('path');
const { expect } = require('@jest/globals');
const pack = require('../config/webpack');
const readFile = require('./readFile');

const fixturesDir = path.resolve(__dirname, '../fixtures');

module.exports = async (filename, callback) => {
  const compiler = pack(filename);

  await new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      if (error) {
        return reject(error);
      }

      if (stats.hasErrors()) {
        return reject(stats.compilation.errors[0]);
      }

      return resolve(stats);
    });
  });

  const compilerOutput = readFile(
    path.resolve(fixturesDir, filename, 'output/index.liquid')
  );
  const expectedCompilerOutput = readFile(
    path.resolve(fixturesDir, filename, 'expected/index.liquid')
  );

  expect(compilerOutput).toEqual(expectedCompilerOutput);
  callback();
};
