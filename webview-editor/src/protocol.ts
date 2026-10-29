/**
 * RN ↔ WebView 桥接协议（与 src/bridge/protocol.ts 保持一致）
 */

/** WebView → React Native 的事件 */
export interface WvReadyEvent {
  type: 'ready';
}

export interface WvChangeEvent {
  type: 'change';
  content: string;
  cursorLine: number;
  totalLines: number;
  charCount: number;
  wordCount: number;
}

export interface WvSaveEvent {
  type: 'save';
  content: string;
}

export type WvEvent = WvReadyEvent | WvChangeEvent | WvSaveEvent;

/** 工具栏可执行的格式化动作 */
export type EditorAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'
  | 'image'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'quote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'table'
  | 'codeBlock'
  | 'hr';

/** React Native → WebView 的命令 */
export interface RnLoadCommand {
  type: 'load';
  content: string;
}

export interface RnExecCommand {
  type: 'exec';
  action: EditorAction;
}

export interface RnThemeCommand {
  type: 'theme';
  dark: boolean;
}

export interface RnModeCommand {
  type: 'mode';
  mode: 'edit' | 'preview';
}

export type RnCommand = RnLoadCommand | RnExecCommand | RnThemeCommand | RnModeCommand;
