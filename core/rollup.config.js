import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';

export default [
  {
    input: 'src/types.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      typescript({ tsconfig: './tsconfig.json' }),
      nodeResolve(),
      commonjs()
    ]
  },
  {
    input: 'src/types.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'esm'
    },
    plugins: [dts()]
  }
]; 