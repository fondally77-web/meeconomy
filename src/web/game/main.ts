import './game.css';
import { App, bootSoundToggle, bootFontScale } from './app.js';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');
bootFontScale();          // 保存した文字サイズを先に反映（描画のちらつき防止）
bootSoundToggle(document.body, new App(root));
