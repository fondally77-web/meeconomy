import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages（https://<user>.github.io/meeconomy/）配下でも動くよう相対パスにする
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),     // ゲーム本体（P3）
        verify: resolve(__dirname, 'verify.html'),  // 経済エンジン検証ビュー
      },
    },
  },
});
