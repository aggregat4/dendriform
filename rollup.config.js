import path from 'path'
import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
//import typescript from 'rollup-plugin-typescript2'
import ts from '@wessberg/rollup-plugin-ts'
//import OMT from 'rollup-plugin-off-main-thread'
import visualizer from 'rollup-plugin-visualizer'

module.exports = {
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
    // for resolving node_modules dependencies
    resolve(),
    // for old schoold modules that are not es6
    commonjs({
      namedExports: {
        // apparently this can't be resolved?
        'node_modules/file-saver/dist/FileSaver.min.js': [ 'saveAs' ]
      }
    }),
    ts(),
    visualizer({
      filename: 'bundle-size.html',
      template: 'treemap',
    })
  ]
}
