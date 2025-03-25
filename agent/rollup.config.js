import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true
  },
  plugins: [
    typescript({ tsconfig: './tsconfig.json' }),
    nodeResolve({ 
      preferBuiltins: true
    }),
    commonjs(),
    json()
  ],
  external: [
    'crypto', 
    'fs', 
    'path', 
    'http', 
    'https', 
    'url', 
    'stream', 
    'zlib', 
    'util', 
    'os',
    'events',
    'buffer',
    'querystring',
    'assert',
    'tty',
    'net',
    'dns',
    'tls',
    'child_process'
  ]
}; 