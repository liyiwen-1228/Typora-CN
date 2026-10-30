/**
 * 快捷键注册表与冲突检测（EX-04 §9.2 / EX-08 §9.3）
 *
 * - 一份定义两端通用：WebView 层 keymap 捕获执行（§9.4），RN 设置页录制自定义
 * - 注册表维护「命令 ID → 组合」+ 反向索引实时查重
 */
import type { EditorAction } from '../bridge/protocol';

export interface CommandDef {
  id: string;
  label: string;
  group: '全局' | '格式' | '编辑';
  /** 默认组合（CM6 风格，Mod = iOS ⌘ / Windows Win 键） */
  defaultKey: string | null;
  /** 命令执行位置 */
  scope: 'webview' | 'rn';
}

/** §9.2 快捷键总表（唯一内置默认，不可删除） */
export const COMMAND_DEFS: CommandDef[] = [
  // A. 全局与文件
  { id: 'newNote', label: '新建笔记', group: '全局', defaultKey: 'Mod-n', scope: 'rn' },
  { id: 'save', label: '手动保存', group: '全局', defaultKey: 'Mod-s', scope: 'webview' },
  { id: 'globalSearch', label: '全库搜索', group: '全局', defaultKey: 'Mod-Shift-f', scope: 'rn' },
  { id: 'palette', label: '命令面板', group: '全局', defaultKey: 'Mod-Shift-p', scope: 'rn' },
  { id: 'outline', label: '大纲面板', group: '全局', defaultKey: 'Mod-Shift-1', scope: 'rn' },
  { id: 'toggleMode', label: '切换 编辑/预览', group: '全局', defaultKey: 'Mod-/', scope: 'rn' },
  // B. 格式化
  { id: 'heading1', label: '标题 H1', group: '格式', defaultKey: 'Mod-1', scope: 'webview' },
  { id: 'heading2', label: '标题 H2', group: '格式', defaultKey: 'Mod-2', scope: 'webview' },
  { id: 'heading3', label: '标题 H3', group: '格式', defaultKey: 'Mod-3', scope: 'webview' },
  { id: 'heading4', label: '标题 H4', group: '格式', defaultKey: 'Mod-4', scope: 'webview' },
  { id: 'heading5', label: '标题 H5', group: '格式', defaultKey: 'Mod-5', scope: 'webview' },
  { id: 'heading6', label: '标题 H6', group: '格式', defaultKey: 'Mod-6', scope: 'webview' },
  { id: 'bold', label: '加粗', group: '格式', defaultKey: 'Mod-b', scope: 'webview' },
  { id: 'italic', label: '斜体', group: '格式', defaultKey: 'Mod-i', scope: 'webview' },
  { id: 'strikethrough', label: '删除线', group: '格式', defaultKey: 'Mod-Shift-x', scope: 'webview' },
  { id: 'inlineCode', label: '行内代码', group: '格式', defaultKey: 'Mod-e', scope: 'webview' },
  { id: 'link', label: '链接', group: '格式', defaultKey: 'Mod-k', scope: 'webview' },
  { id: 'image', label: '图片', group: '格式', defaultKey: 'Mod-Shift-i', scope: 'webview' },
  { id: 'quote', label: '引用', group: '格式', defaultKey: 'Mod-Shift-q', scope: 'webview' },
  { id: 'bulletList', label: '无序列表', group: '格式', defaultKey: 'Mod-Shift-u', scope: 'webview' },
  { id: 'orderedList', label: '有序列表', group: '格式', defaultKey: 'Mod-Shift-o', scope: 'webview' },
  { id: 'taskList', label: '任务列表', group: '格式', defaultKey: 'Mod-Shift-t', scope: 'webview' },
  { id: 'table', label: '表格', group: '格式', defaultKey: 'Mod-t', scope: 'webview' },
  { id: 'codeBlock', label: '代码块', group: '格式', defaultKey: 'Mod-Shift-k', scope: 'webview' },
  { id: 'hr', label: '水平线', group: '格式', defaultKey: 'Mod-Shift--', scope: 'webview' },
  { id: 'clearFormat', label: '清除格式', group: '格式', defaultKey: 'Mod-\\', scope: 'webview' },
  { id: 'formatTable', label: '美化表格', group: '格式', defaultKey: null, scope: 'webview' },
  // C. 编辑器操作
  { id: 'undo', label: '撤销', group: '编辑', defaultKey: 'Mod-z', scope: 'webview' },
  { id: 'redo', label: '重做', group: '编辑', defaultKey: 'Shift-Mod-z', scope: 'webview' },
  { id: 'find', label: '文内查找', group: '编辑', defaultKey: 'Mod-f', scope: 'webview' },
];

/** 工具栏动作 → 命令 id 映射（格式化命令 id 与 EditorAction 一致） */
export const FORMAT_ACTION_IDS: EditorAction[] = [
  'bold', 'italic', 'strikethrough', 'inlineCode', 'link', 'image',
  'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
  'quote', 'bulletList', 'orderedList', 'taskList', 'table', 'codeBlock', 'hr',
  'clearFormat', 'formatTable',
];

/** iOS 系统保留组合（§9.3 类型②：⌘Space 聚焦搜索、⌘⇧3/⌘⇧4 截图、⌘H/⌘⇧H 等） */
export const SYSTEM_RESERVED_COMBOS: ReadonlySet<string> = new Set([
  'Mod-Space',
  'Mod-Shift-3',
  'Mod-Shift-4',
  'Mod-h',
  'Mod-Shift-h',
  'Mod-m',
  'Mod-Shift-3',
]);

/** 系统文本编辑惯例键（§9.3 类型③：剪贴板与全选） */
export const TEXT_EDIT_COMBOS: ReadonlySet<string> = new Set([
  'Mod-c',
  'Mod-v',
  'Mod-x',
  'Mod-a',
]);

/** 归一化组合串：解析「修饰键-基键」为规范形式 Mod-Alt-Shift-<key> */
export function normalizeCombo(combo: string): string | null {
  const trimmed = combo.trim();
  if (!trimmed) return null;
  // CM6 语法允许 'Mod-Shift--'：最后一个 '-' 是基键
  const parts = trimmed.split(/-(?!$)/);
  const base = parts.pop();
  if (!base) return null;
  const baseKey = base.length === 1 ? base.toLowerCase() : base;
  let hasMod = false;
  let hasAlt = false;
  let hasShift = false;
  for (const part of parts) {
    switch (part) {
      case 'Mod':
      case 'Cmd':
      case 'Ctrl':
      case 'Meta':
      case 'Control':
        hasMod = true;
        break;
      case 'Alt':
      case 'Option':
        hasAlt = true;
        break;
      case 'Shift':
        hasShift = true;
        break;
      default:
        return null; // 未知修饰键
    }
  }
  const out: string[] = [];
  if (hasMod) out.push('Mod');
  if (hasAlt) out.push('Alt');
  if (hasShift) out.push('Shift');
  out.push(baseKey);
  return out.join('-');
}

/** 可用基键：单字符或常见功能键 */
const NAMED_KEYS: ReadonlySet<string> = new Set([
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete',
]);

export interface ComboValidation {
  ok: boolean;
  kind?: 'format' | 'reserved' | 'text' | 'conflict' | 'modifier';
  reason?: string;
  /** 冲突时被占用的命令标签（可「转移」） */
  conflictWith?: string;
}

/** 校验录制到的组合（§9.3 三类冲突检测 + 基础格式检查） */
export function validateCombo(
  combo: string,
  effective: Record<string, string>,
  ownId: string,
): ComboValidation {
  const norm = normalizeCombo(combo);
  if (!norm) {
    return { ok: false, kind: 'format', reason: '无法识别的按键组合' };
  }
  const parts = norm.split('-');
  const base = parts[parts.length - 1];
  const hasMod = parts.includes('Mod');
  if (!hasMod) {
    return { ok: false, kind: 'modifier', reason: '快捷键需包含 Mod（⌘/Win）修饰键' };
  }
  if (!(base.length === 1 || NAMED_KEYS.has(base))) {
    return { ok: false, kind: 'format', reason: '该按键不能用作快捷键' };
  }
  if (SYSTEM_RESERVED_COMBOS.has(norm)) {
    return { ok: false, kind: 'reserved', reason: '系统保留组合，请换一组' };
  }
  if (TEXT_EDIT_COMBOS.has(norm)) {
    return { ok: false, kind: 'text', reason: '与系统文本编辑冲突（剪贴板/全选）' };
  }
  for (const [id, key] of Object.entries(effective)) {
    if (id === ownId) continue;
    if (key && normalizeCombo(key) === norm) {
      const def = COMMAND_DEFS.find((d) => d.id === id);
      return {
        ok: false,
        kind: 'conflict',
        reason: `与【${def?.label ?? id}】冲突`,
        conflictWith: def?.label ?? id,
      };
    }
  }
  return { ok: true };
}

/** 自定义覆盖：commandId → 组合（null 表示已清除快捷键） */
export type KeymapOverrides = Record<string, string | null>;

/** 默认绑定表 */
export function defaultKeymap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of COMMAND_DEFS) {
    if (def.defaultKey) map[def.id] = def.defaultKey;
  }
  return map;
}

/** 生效绑定表 = 默认 ⊕ 自定义覆盖 */
export function effectiveKeymap(overrides: KeymapOverrides | undefined): Record<string, string> {
  const map = defaultKeymap();
  if (!overrides) return map;
  for (const [id, combo] of Object.entries(overrides)) {
    if (combo === null) delete map[id];
    else if (combo) map[id] = combo;
  }
  return map;
}

/** 组合 → 显示文本（iOS 风格） */
export function comboToDisplay(combo: string): string {
  const norm = normalizeCombo(combo);
  if (!norm) return combo;
  const parts = norm.split('-');
  const base = parts.pop() as string;
  const out: string[] = [];
  for (const part of parts) {
    if (part === 'Mod') out.push('⌘');
    else if (part === 'Alt') out.push('⌥');
    else if (part === 'Shift') out.push('⇧');
  }
  const named: Record<string, string> = {
    Tab: '⇥',
    Enter: '↩',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backspace: '⌫',
    Delete: '⌦',
    Space: '空格',
  };
  out.push(named[base] ?? base.toUpperCase());
  return out.join('');
}
