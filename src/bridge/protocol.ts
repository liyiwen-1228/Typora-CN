/**
 * RN ↔ WebView 桥接协议
 *
 * - WebView → RN：通过 window.ReactNativeWebView.postMessage(JSON 字符串) 发送 WvEvent
 * - RN → WebView：通过 webviewRef.current.postMessage(JSON 字符串) 发送 RnCommand，
 *   在 WebView 内以 window 的 'message' 事件接收
 */

/** WebView → React Native 的事件 */
export interface WvReadyEvent {
  type: 'ready';
}

export interface WvChangeEvent {
  type: 'change';
  /** 全文内容 */
  content: string;
  /** 光标所在行（1 起） */
  cursorLine: number;
  /** 总行数 */
  totalLines: number;
  /** 字符数（content.length） */
  charCount: number;
  /** 字数（中日韩按字计，拉丁连续串按词计） */
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
