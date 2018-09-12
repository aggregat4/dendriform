const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

var path = require('path')

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: {
    example: './src/example/main.ts',
    tree: './src/ts/tree.ts'
  },  
  output: {
    path: path.resolve(__dirname, 'dist'),
    // name substitution so that the entrypoint name gets inserted here
    filename: '[name].bundle.js'
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.ts', '.tsx', '.js']
  },
  module: {
    rules: [
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      { test: /\.tsx?$/, loader: 'ts-loader' }
    ]
  },
  plugins: [
    // new BundleAnalyzerPlugin()
  ]
}
