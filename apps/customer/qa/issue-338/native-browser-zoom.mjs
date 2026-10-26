import { execFileSync } from 'node:child_process';

// Real browser accelerators on the QA-only virtual X display, not CSS zoom or DPR emulation.
export function setNativeBrowserZoom(title) {
  const command = process.env.QA338_XDOTOOL || 'xdotool';
  const windowId = execFileSync(command, ['search', '--sync', '--onlyvisible', '--name', title],
    { encoding: 'utf8', timeout: 5000 }).trim().split('\n').at(-1);
  execFileSync(command, ['windowfocus', '--sync', windowId]);
  execFileSync(command, ['key', '--clearmodifiers', 'ctrl+0',
    'ctrl+plus', 'ctrl+plus', 'ctrl+plus', 'ctrl+plus', 'ctrl+plus']);
}
