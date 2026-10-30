/**
 * 快捷键录制页（EX-08）：录制硬件键盘组合 → 归一化 CM6 组合串 → 桥接发给 RN。
 * 与编辑器分开打包（recorder.html），无 CM6 依赖。
 */
import { postEvent } from './bridge';

const MODIFIER_KEYS = new Set(['Shift', 'Meta', 'Alt', 'Control', 'CapsLock', 'Dead']);

window.addEventListener('keydown', (e) => {
  e.preventDefault();
  if (e.key === 'Escape') {
    postEvent({ type: 'recordKey', combo: '', cancel: true });
    return;
  }
  if (MODIFIER_KEYS.has(e.key)) return;
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('Mod');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  postEvent({ type: 'recordKey', combo: parts.join('-') });
});

// 通知 RN 录制器就绪
postEvent({ type: 'ready' });
