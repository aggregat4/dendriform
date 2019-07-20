import commonjs from 'rollup-plugin-commonjs'
import resolve from 'rollup-plugin-node-resolve'
import typescript from 'rollup-plugin-typescript'
import OMT from 'rollup-plugin-off-main-thread'
import { terser } from 'rollup-plugin-terser'

module.exports = {
  input: {
    example: 'src/example/main.ts',
    tree: 'src/ts/tree.ts'
  },
  output: {
    dir: 'rdist',
    entryFileNames: '[name].bundle.js',
    format: 'amd',
    sourcemap: true
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
    typescript(),
    // minifier that can do es6
    terser(),
    // off main thread: I just use it so the generated bundles are loadable (missing "define"), but can help with webworkers as well
    OMT()
  ]
}
