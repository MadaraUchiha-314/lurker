import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import copy from 'rollup-plugin-copy';
import replace from '@rollup/plugin-replace';
import postcss from 'rollup-plugin-postcss';

export default [
  {
    input: 'src/background.ts',
    output: {
      file: 'dist/background.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      typescript({ tsconfig: './tsconfig.json' }),
      nodeResolve({
        browser: true
      }),
      commonjs(),
      json(),
      copy({
        targets: [
          { src: 'public/manifest.json', dest: 'dist' },
          { src: 'src/panel/index.html', dest: 'dist', rename: 'panel.html' },
          { src: 'src/panel/theme-init.js', dest: 'dist' }
        ]
      })
    ]
  },
  {
    input: 'src/content.ts',
    output: {
      file: 'dist/content.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      typescript({ tsconfig: './tsconfig.json' }),
      nodeResolve({
        browser: true
      }),
      commonjs(),
      json()
    ]
  },
  {
    input: 'src/panel/index.tsx',
    output: {
      file: 'dist/panel.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      replace({
        preventAssignment: true,
        'process.env.NODE_ENV': JSON.stringify('production')
      }),
      postcss({
        config: {
          path: './postcss.config.js',
        },
        extensions: ['.css'],
        minimize: true,
        inject: {
          insertAt: 'top',
        },
      }),
      typescript({ tsconfig: './tsconfig.json' }),
      nodeResolve({
        browser: true
      }),
      commonjs(),
      json()
    ]
  }
]; 