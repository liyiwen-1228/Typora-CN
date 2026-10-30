/**
 * RN ↔ WebView 桥接协议（与 webview-editor/src/protocol.ts 保持一致）
 *
 * - WebView → RN：window.ReactNativeWebView.postMessage(JSON 字符串) 发送 WvEvent
 * - RN → WebView：webviewRef.current.postMessage(JSON 字符串) 发送 RnCommand，
 *   在 WebView 内以 window 的 'message' 事件接收
 */

/** WebView → React Native 的事件 */
export interface WvReadyEvent {
  type: 'ready';
}

export interface HeadingInfo {
  level: number;
  text: string;
  line: number;
}

export interface WvChangeEvent {
  type: 'change';
  content: string;
  cursorLine: number;
  totalLines: number;
  charCount: number;
  wordCount: number;
  /** 全文标题树（大纲面板数据） */
  headings: HeadingInfo[];
}

export interface WvSaveEvent {
  type: 'save';
  content: string;
}

/** 快捷键录制结果（recorder.html 使用） */
export interface WvRecordKeyEvent {
  type: 'recordKey';
  combo: string;
  cancel?: boolean;
}

/** WebView 请求 RN 解析相对路径图片（读取文件转 base64） */
export interface WvRequestImagesEvent {
  type: 'requestImages';
  paths: string[];
}

/** WebView 完成导出 HTML 的组装 */
export interface WvExportResultEvent {
  type: 'exportResult';
  kind: 'html' | 'pdf';
  html: string;
  error?: string;
}

/** WebView 层捕获的全局命令（快捷键触发，经桥接由 RN 执行） */
export type WvGlobalCommand =
  | 'newNote'
  | 'globalSearch'
  | 'palette'
  | 'outline'
  | 'toggleMode'
  | 'image';

export interface WvCommandEvent {
  type: 'command';
  command: WvGlobalCommand;
}

/** 预览中点击 Wiki 链接 */
export interface WvOpenNoteEvent {
  type: 'openNote';
  title: string;
}

export type WvEvent =
  | WvReadyEvent
  | WvChangeEvent
  | WvSaveEvent
  | WvRecordKeyEvent
  | WvRequestImagesEvent
  | WvExportResultEvent
  | WvCommandEvent
  | WvOpenNoteEvent;

/** 工具栏/命令面板可执行的格式化动作 */
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
  | 'hr'
  | 'clearFormat'
  | 'formatTable'
  | 'find'
  | 'undo'
  | 'redo';

/** 主题名（一期 XT-01：默认/墨黑/Nord/Solarized/Dracula/GitHub Light） */
export type ThemeName =
  | 'default'
  | 'ink'
  | 'nord'
  | 'solarized'
  | 'dracula'
  | 'github-light';

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
  theme?: ThemeName;
  customCss?: string;
}

export interface RnModeCommand {
  type: 'mode';
  mode: 'edit' | 'preview';
}

/** 在光标处插入文本（如图片引用） */
export interface RnInsertCommand {
  type: 'insert';
  text: string;
}

/** 大纲跳转：滚动到指定行并把光标落位 */
export interface RnScrollToCommand {
  type: 'scrollTo';
  line: number;
}

/** 编辑器设置（字号 14–22px、行高 1.4–2.0、等宽字体） */
export interface RnSettingsCommand {
  type: 'settings';
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;
}

/** 重建快捷键表（commandId → 组合；值为组合字符串） */
export interface RnKeymapCommand {
  type: 'keymap';
  bindings: Record<string, string>;
}

/** 聚焦 / 打字机模式开关 */
export interface RnViewModesCommand {
  type: 'viewModes';
  focus?: boolean;
  typewriter?: boolean;
}

/** 响应 requestImages：相对路径 → data URI */
export interface RnImagesCommand {
  type: 'images';
  map: Record<string, string>;
}

/** 请求组装导出用自包含 HTML */
export interface RnExportHtmlCommand {
  type: 'exportHtml';
  kind: 'html' | 'pdf';
  forceLight: boolean;
}

export type RnCommand =
  | RnLoadCommand
  | RnExecCommand
  | RnThemeCommand
  | RnModeCommand
  | RnInsertCommand
  | RnScrollToCommand
  | RnSettingsCommand
  | RnKeymapCommand
  | RnViewModesCommand
  | RnImagesCommand
  | RnExportHtmlCommand;
