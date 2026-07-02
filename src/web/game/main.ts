import './game.css';
import { App, bootSoundToggle } from './app.js';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');
new App(root);
bootSoundToggle(document.body);
