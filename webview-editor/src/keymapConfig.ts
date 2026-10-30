/**
 * 快捷键构建（EX-04/EX-08）：根据注册表 bindings（commandId → 组合）
 * 动态生成 CM6 KeyBinding[]，经 Compartment 重建即时生效。
 */
import type { EditorView, KeyBinding } from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { runAction } from './commands';
import type { EditorAction, WvGlobalCommand } from './protocol';

export interface KeymapHandlers {
  save: (view: EditorView) => boolean;
  globalCommand: (command: WvGlobalCommand) => boolean;
}

/** 注册表中与编辑器相关的动作命令 id（image 走全局命令：相册选图 → 插入引用） */
const ACTION_COMMANDS: EditorAction[] = [
  'bold', 'italic', 'strikethrough', 'inlineCode', 'link',
  'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
  'quote', 'bulletList', 'orderedList', 'taskList', 'table', 'codeBlock', 'hr',
  'clearFormat', 'formatTable',
];

const GLOBAL_COMMANDS: WvGlobalCommand[] = [
  'newNote', 'globalSearch', 'palette', 'outline', 'toggleMode', 'image',
];

/** 依据绑定表构建 KeyBinding[]（顺序无关，整组替换） */
export function buildKeyBindings(
  bindings: Record<string, string>,
  handlers: KeymapHandlers,
): KeyBinding[] {
  const out: KeyBinding[] = [];
  const add = (id: string, run: (view: EditorView) => boolean) => {
    const combo = bindings[id];
    if (!combo) return;
    out.push({ key: combo, run });
  };
  for (const action of ACTION_COMMANDS) {
    add(action, (view) => runAction(view, action));
  }
  add('find', (view) => openSearchPanel(view));
  add('undo', (view) => undo(view));
  add('redo', (view) => redo(view));
  add('save', handlers.save);
  for (const command of GLOBAL_COMMANDS) {
    add(command, () => handlers.globalCommand(command));
  }
  return out;
}
