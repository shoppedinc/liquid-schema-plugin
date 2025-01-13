# Liquid Schema Plugin

This plugin allows Shopify section schema to be imported from JavaScript files into Liquid sections. It is compatible with any Webpack based build system. This allows you to build partials that can be shared across multiple sections and applied in different contexts such as section blocks or settings.

## Installation
Install using yarn:
```shell
yarn add --dev liquid-schema-plugin
```

Or npm:
```shell
npm install --save-dev liquid-schema-plugin
```

### Webpack

Add the plugin to `webpack.config.js`
```js
const LiquidSchemaPlugin = require('liquid-schema-plugin');

module.exports = {
  // ...
  plugins: [
    // ...
    new LiquidSchemaPlugin({
      from: {
        liquid: './src/sections',
        schema: './src/schema'
      },
      to: './dist/sections'
    })
  ]
}
```

## Usage

This plugin will attempt to find and compile schema for any Liquid section source file that does not already contain `{% schema %}` and `{% endschema %}` tags in its contents.

The schema JS files rely on a consistent naming convention to be paired with the Shopify section files. The JS file path is prefixed with `section-`. For example, `hero-banner.liquid` in the Liquid source directory would be paired with `section-hero-banner.js` in the schema directory.

```js
// schema.js
const banner = require('./components/banner')

module.exports = {
  name: 'Section',
  blocks: [banner]
}
```

## Further Reading
If you'd like to learn more about how you can benefit from using this plugin, you can read about making schemas easier to maintain, creating repeatable groups of schema settings and making your schemas modular in [this blog post](https://ellodave.dev/blog/2020/10/14/building-shopify-section-schemas-with-javascript).
