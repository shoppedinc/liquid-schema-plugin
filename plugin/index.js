const fs = require('fs-extra');
const path = require('path');
const validate = require('schema-utils');
const { RawSource } = require('webpack-sources');
const { asString } = require('webpack').Template;
const optionsSchema = require('./schema');

const PLUGIN_NAME = 'Liquid Schema Plugin';
const SCHEMA_REGEX = /{%-?\s*schema\s*('.*'|".*")\s*-?%}(([\s\S]*){%-?\s*endschema\s*-?%})?/;

function LiquidSchemaPlugin(opts = {}) {
  validate(optionsSchema, opts, { name: PLUGIN_NAME });
  const options = opts;

  function apply(compiler) {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapPromise(
        PLUGIN_NAME,
        buildSchema.bind(this, compilation)
      );
    });
  }

  async function buildSchema(compilation) {
    const files = await fs.readdir(options.from.liquid);
    const compilationOutput = compilation.compiler.outputPath;

    compilation.contextDependencies.add(options.from.liquid);
    compilation.contextDependencies.add(options.from.schema);

    const preTransformCache = [...Object.keys(require.cache)];

    await Promise.all(
      files.map(async (file) => {
        const fileLocation = path.resolve(options.from.liquid, file);
        const fileStat = await fs.stat(fileLocation);

        if (fileStat.isFile() && path.extname(file) === '.liquid') {
          const relativeFilePath = path.relative(
            compilation.options.context,
            fileLocation
          );

          const outputKey = getOutputKey(fileLocation, compilationOutput);
          try {
            // eslint-disable-next-line no-param-reassign
            compilation.assets[outputKey] = await replaceSchemaTags(
              fileLocation,
              compilation
            );
          } catch (error) {
            compilation.errors.push(
              new Error(`./${relativeFilePath}\n\n${error}`)
            );
          }
        }
      })
    );

    const postTransformCache = [...Object.keys(require.cache)];
    postTransformCache
      .filter(module => !preTransformCache.includes(module))
      .forEach(module => {
        compilation.contextDependencies.add(path.dirname(module));
        compilation.fileDependencies.add(module);
        delete require.cache[module];
      });
  }

  function getOutputKey(liquidSourcePath, compilationOutput) {
    const fileName = path.relative(options.from.liquid, liquidSourcePath);
    const relativeOutputPath = path.relative(compilationOutput, options.to);
    return path.join(relativeOutputPath, fileName);
  }

  async function replaceSchemaTags(fileLocation, compilation) {
    const fileName = path.basename(fileLocation, '.liquid');
    const fileContents = await fs.readFile(fileLocation, 'utf-8');
    const fileContainsReplaceableSchemaRegex = SCHEMA_REGEX.test(fileContents);
  
    if (!fileContainsReplaceableSchemaRegex) {
      return new RawSource(fileContents);
    }

    // eslint-disable-next-line prefer-const
    let [match, importableFilePath, , contents] = fileContents.match(
      SCHEMA_REGEX
    );
    importableFilePath = importableFilePath.replace(/(^('|"))|(('|")$)/g, '');
    importableFilePath = path.resolve(options.from.schema, importableFilePath);

    compilation.fileDependencies.add(require.resolve(importableFilePath));

    let importedSchema;
    try {
      importedSchema = require(importableFilePath);
    } catch (error) {
      throw [
        match,
        '^',
        `    File to import not found or unreadable: ${importableFilePath}`,
        `    in ${fileLocation}`,
      ].join('\n');
    }

    try {
      contents = JSON.parse(contents);
    } catch (error) {
      contents = null;
    }

    let schema = importedSchema;
    if (typeof importedSchema === 'function') {
      schema = importedSchema(fileName, contents);
    }

    if (typeof schema !== 'object') {
      throw [
        schema,
        '^',
        `    Schema expected to be of type "object"`,
        `    in ${require.resolve(importableFilePath)}`,
      ].join('\n');
    }

    return new RawSource(
      fileContents.replace(
        SCHEMA_REGEX,
        asString([
          '{% schema %}',
          JSON.stringify(schema, null, 2),
          '{% endschema %}',
        ])
      )
    );
  }

  return {
    apply,
    buildSchema,
    getOutputKey,
    replaceSchemaTags,
  };
}

module.exports = LiquidSchemaPlugin;
