const fs = require('fs-extra');
const path = require('path');
const validate = require('schema-utils');
const { RawSource } = require('webpack-sources');

const optionsSchema = require('./schema');

const PLUGIN_NAME = 'Liquid Schema Plugin';

module.exports = class LiquidSchemaPlugin {
  constructor(options = {}) {
    validate(optionsSchema, options, { name: PLUGIN_NAME });
    this.options = options;
  }

  apply(compiler) {
    const isWebpack4 = !compiler.webpack;

    if (isWebpack4) {
      compiler.hooks.emit.tapPromise(PLUGIN_NAME, this.buildSchema.bind(this));

      return;
    }

    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, compilation => {
      compilation.hooks.processAssets.tapPromise(
        PLUGIN_NAME,
        this.buildSchema.bind(this, compilation)
      );
    });
  }

  async buildSchema(compilation) {
    const files = await fs.readdir(this.options.from.liquid);
    const compilationOutput = compilation.compiler.outputPath;

    compilation.contextDependencies.add(this.options.from.liquid);
    compilation.contextDependencies.add(this.options.from.schema);

    const preTransformCache = [...Object.keys(require.cache)];

    return Promise.all(
      files.map(async file => {
        const fileLocation = path.resolve(this.options.from.liquid, file);
        const fileStat = await fs.stat(fileLocation);

        if (fileStat.isFile() && path.extname(file) === '.liquid') {
          const relativeFilePath = path.relative(
            compilation.options.context,
            fileLocation
          );

          const outputKey = this.getOutputKey(fileLocation, compilationOutput);

          try {
            // eslint-disable-next-line no-param-reassign
            compilation.assets[outputKey] = await this.compileSchemaTags(
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
    ).then(() => {
      const postTransformCache = [...Object.keys(require.cache)];
      postTransformCache
        .filter(module => !preTransformCache.includes(module))
        .forEach(module => {
          compilation.contextDependencies.add(path.dirname(module));
          compilation.fileDependencies.add(module);
          delete require.cache[module];
        });
    });
  }

  getOutputKey(liquidSourcePath, compilationOutput) {
    const fileName = path.relative(this.options.from.liquid, liquidSourcePath);
    const relativeOutputPath = path.relative(
      compilationOutput,
      this.options.to
    );

    return path.join(relativeOutputPath, fileName);
  }

  async compileSchemaTags(fileLocation, compilation) {
    const fileName = path.basename(fileLocation, '.liquid');
    const fileContents = await fs.readFile(fileLocation, 'utf-8');

    const schemaRegex = /{%-?\s*schema\s*('.*'|".*")\s*-?%}(([\s\S]*){%-?\s*endschema\s*-?%})?/;
    const fileContainsSchema = schemaRegex.test(fileContents);

    if (fileContainsSchema) {
      return new RawSource(fileContents);
    }

    const importableFileName = `section-${fileName}.js`;
    const importableFilePath = path.resolve(
      this.options.from.schema,
      importableFileName
    );

    if (!fs.existsSync(importableFilePath)) {
      return new RawSource(fileContents);
    }

    compilation.fileDependencies.add(require.resolve(importableFilePath));

    let importedSchema;
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      importedSchema = require(importableFilePath);
    } catch (error) {
      throw [
        '^',
        `    File to import not found or unreadable: ${importableFilePath}`,
        `    in ${fileLocation}`,
      ].join('\n');
    }

    let schema = importedSchema;
    if (typeof importedSchema === 'function') {
      schema = importedSchema(fileName);
    }

    if (typeof schema !== 'object') {
      throw [
        schema,
        '^',
        `    Schema expected to be of type "object"`,
        `    in ${require.resolve(importableFilePath)}`,
      ].join('\n');
    }

    const relativePathString = `./${path.relative(
      path.resolve(process.cwd()),
      path.resolve(__dirname, importableFilePath)
    )}`;
    const comment = `{% comment %} Schema compiled by Liquid Schema Plugin from ${relativePathString} {% endcomment %}`;
    const commentRegex = new RegExp(comment, 'i');
    const hasComment = commentRegex.test(fileContents);

    if (!hasComment) {
      fs.appendFileSync(fileLocation, `\n${comment}\n`);
    }

    const schemaString = `{% schema %}\n${JSON.stringify(
      schema,
      null,
      2
    )}\n{% endschema %}`;

    const fileContentsWithSchema = hasComment
      ? `${fileContents}\n${schemaString}`
      : `${fileContents}\n${comment}\n\n${schemaString}`;
    return new RawSource(fileContentsWithSchema);
  }
};
