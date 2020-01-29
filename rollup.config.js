import path from 'path'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import ts from '@wessberg/rollup-plugin-ts'
//import OMT from 'rollup-plugin-off-main-thread'
import visualizer from 'rollup-plugin-visualizer'
import html2 from 'rollup-plugin-html2'

export default {
  input: {
    example: 'src/example/main.ts',
    tree: 'src/ts/tree.ts'
  },
  output: {
    dir: 'dist',
    entryFileNames: '[name].[hash].mjs',
    format: 'esm',
    sourcemap: true
  },
  manualChunks(id) {
    if (id.includes('node_modules')) {
      // Return the directory name following the last `node_modules`.
      // Usually this is the package, but it could also be the scope.
      const dirs = id.split(path.sep);
      return dirs[dirs.lastIndexOf('node_modules') + 1];
    }
  },
  plugins: [
    // adds the generated bundles as es6 modules to our index.html (because names contain content hashes)
    html2({
      template: 'src/example/index.html',
      file: 'index.html',
      modules: true,
      // This plugin always starts the path of the file with / which is the root context and causes the resolution to fail
      // This is a workaround for that.
      onlinePath: '.',
    }),
    // for resolving node_modules dependencies
    resolve(),
    // for old schoold modules that are not es6
    commonjs({
      namedExports: {
        // apparently this can't be resolved?
        'node_modules/file-saver/dist/FileSaver.min.js': [ 'saveAs' ]
      }
    }),
    ts({
      browserslist: false,
    }),
    visualizer({
      filename: 'bundle-size.html',
      template: 'treemap',
    }),
  ]
}
