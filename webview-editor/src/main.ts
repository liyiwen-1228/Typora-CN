/**
 * WebView 编辑器入口：CodeMirror 6 + 预览管线 + 桥接命令分发
 */
import type { Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { search } from '@codemirror/search';
import { onCommand, postEvent } from './bridge';
import { runAction } from './commands';
import { buildKeyBindings } from './keymapConfig';
import { focusModeExtension, typewriterExtension } from './modes';
import {
  buildExportDocument,
  buildPreviewHtml,
  enhanceMermaid,
  type PreviewResult,
} from './preview';
import { editorHighlighting, editorTheme } from './theme';
import type {
  HeadingInfo,
  RnCommand,
  ThemeName,
  WvGlobalCommand,
} from './protocol';

const editorHost = document.getElementById('editor') as HTMLDivElement;
const previewEl = document.getElementById('preview') as HTMLDivElement;

/** 字数统计：中日韩字符按“字”计，拉丁/数字连续串按“词”计 */
function countWords(text: string): number {
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjk + latin;
}

/** 从文档中提取标题树（跳过代码围栏内的 # 行） */
function collectHeadings(state: EditorState): HeadingInfo[] {
  const out: HeadingInfo[] = [];
  const text = state.doc.toString();
  let inFence = false;
  let line = 1;
  for (const raw of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      line += 1;
      continue;
    }
    if (!inFence) {
      const m = /^(#{1,6})\s+(.+?)\s*$/.exec(raw);
      if (m) out.push({ level: m[1].length, text: m[2].replace(/\s+#+$/, ''), line });
    }
    line += 1;
  }
  return out;
}

/* ---------------- 全局可变状态 ---------------- */

let postTimer: number | undefined;
let lastPostAt = 0;
let view: EditorView;
let currentMode: 'edit' | 'preview' = 'edit';
let isDarkNow = false;
let currentTheme: ThemeName = 'default';
let previewToken = 0;

const keymapComp = new Compartment();
const modesComp = new Compartment();

let focusEnabled = false;
let typewriterEnabled = false;

function buildModeExtensions(): readonly Extension[] {
  const exts: Extension[] = [];
  if (focusEnabled) exts.push(focusModeExtension());
  if (typewriterEnabled) exts.push(typewriterExtension());
  return exts;
}

/** 当前是否为深色主题（决定导出/渲染基色） */
function isDarkThemeNow(theme: ThemeName, dark: boolean): boolean {
  if (theme === 'ink' || theme === 'nord' || theme === 'dracula') return true;
  if (theme === 'solarized' || theme === 'github-light') return false;
  return dark;
}

/* ---------------- 变更上报（节流 + 尾部保证） ---------------- */

function postChange(state: EditorState): void {
  const content = state.doc.toString();
  postEvent({
    type: 'change',
    content,
    cursorLine: state.doc.lineAt(state.selection.main.head).number,
    totalLines: state.doc.lines,
    charCount: content.length,
    wordCount: countWords(content),
    headings: collectHeadings(state),
  });
}

function schedulePost(): void {
  if (postTimer !== undefined) {
    window.clearTimeout(postTimer);
    postTimer = undefined;
  }
  const wait = lastPostAt + 300 - Date.now();
  if (wait <= 0) {
    lastPostAt = Date.now();
    postChange(view.state);
  } else {
    postTimer = window.setTimeout(() => {
      postTimer = undefined;
      lastPostAt = Date.now();
      postChange(view.state);
    }, wait);
  }
}

/* ---------------- 图片解析（RN 读取文件 → data URI） ---------------- */

const imageCache = new Map<string, string>();
interface PendingImage {
  resolve: (v: string | null) => void;
  timer: number;
}
const imagePending = new Map<string, PendingImage[]>();

function resolveImage(rel: string): Promise<string | null> {
  const cached = imageCache.get(rel);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = imagePending.get(rel);
  if (pending && pending.length > 0) {
    return new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 4000);
      pending.push({ resolve, timer });
    });
  }
  return new Promise<string | null>((resolve) => {
    const timer = window.setTimeout(() => {
      const list = imagePending.get(rel);
      imagePending.delete(rel);
      if (list) {
        for (const p of list) {
          window.clearTimeout(p.timer);
          p.resolve(null);
        }
      }
      resolve(null);
    }, 4000);
    imagePending.set(rel, [{ resolve, timer }]);
    postEvent({ type: 'requestImages', paths: [rel] });
  });
}

function handleImages(map: Record<string, string>): void {
  for (const [rel, data] of Object.entries(map)) {
    imageCache.set(rel, data);
    const pending = imagePending.get(rel);
    if (pending) {
      imagePending.delete(rel);
      for (const p of pending) {
        window.clearTimeout(p.timer);
        p.resolve(data);
      }
    }
  }
}

/* ---------------- 预览 ---------------- */

async function enterPreview(): Promise<void> {
  const token = ++previewToken;
  previewEl.innerHTML = '<div class="preview-loading">渲染中…</div>';
  try {
    const docText = view.state.doc.toString();
    const result = await buildPreviewHtml(docText, {
      dark: isDarkThemeNow(currentTheme, isDarkNow),
      resolveImage,
    });
    if (token !== previewToken) return;
    previewEl.innerHTML = result.html;
    await enhanceMermaid(previewEl, result, isDarkThemeNow(currentTheme, isDarkNow));
  } catch {
    if (token !== previewToken) return;
    previewEl.innerHTML = '<div class="preview-loading">渲染失败</div>';
  }
}

function setMode(mode: 'edit' | 'preview'): void {
  currentMode = mode;
  if (mode === 'preview') {
    editorHost.style.display = 'none';
    previewEl.style.display = 'block';
    void enterPreview();
  } else {
    previewToken += 1;
    previewEl.style.display = 'none';
    editorHost.style.display = 'block';
    view.focus();
  }
}

/* ---------------- 自定义 CSS（XT-01） ---------------- */

function applyCustomCss(css: string): void {
  let styleEl = document.getElementById('custom-css') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-css';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

/* ---------------- 导出（OT-02/03） ---------------- */

async function handleExport(kind: 'html' | 'pdf', forceLight: boolean): Promise<void> {
  try {
    const docText = view.state.doc.toString();
    const dark = forceLight ? false : isDarkThemeNow(currentTheme, isDarkNow);
    const holder = document.createElement('div');
    holder.className = 'export-holder';
    document.body.appendChild(holder);
    try {
      const result: PreviewResult = await buildPreviewHtml(docText, {
        dark,
        resolveImage,
      });
      holder.innerHTML = result.html;
      await enhanceMermaid(holder, result, dark);
      // 深色主题强制打印浅色版；浅色主题保持主题观感
      const exportTheme =
        forceLight && isDarkThemeNow(currentTheme, isDarkNow)
          ? 'default'
          : currentTheme;
      const title = result.headings[0]?.text ?? '未命名';
      const html = buildExportDocument(holder.innerHTML, { title, dark, theme: exportTheme });
      postEvent({ type: 'exportResult', kind, html });
    } finally {
      holder.remove();
    }
  } catch (err) {
    postEvent({
      type: 'exportResult',
      kind,
      html: '',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ---------------- 编辑器初始化 ---------------- */

const keymapHandlers = {
  save: (v: EditorView): boolean => {
    postEvent({ type: 'save', content: v.state.doc.toString() });
    return true;
  },
  globalCommand: (command: WvGlobalCommand): boolean => {
    postEvent({ type: 'command', command });
    return true;
  },
};

view = new EditorView({
  parent: editorHost,
  state: EditorState.create({
    doc: '',
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      highlightActiveLine(),
      indentOnInput(),
      indentUnit.of('  '),
      bracketMatching(),
      closeBrackets(),
      search({ top: true }),
      editorHighlighting,
      markdown({ codeLanguages: languages }),
      editorTheme,
      keymapComp.of(keymap.of([])),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      modesComp.of([]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) schedulePost();
      }),
    ],
  }),
});

/* ---------------- 预览点击（Wiki 链接） ---------------- */

previewEl.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement | null)?.closest('.wiki-link');
  if (target) {
    e.preventDefault();
    const title = target.getAttribute('data-wiki') || '';
    postEvent({ type: 'openNote', title });
    return;
  }
  // 页内锚点（[TOC]/脚注）由浏览器默认处理
});

/* ---------------- RN 命令分发 ---------------- */

onCommand((cmd: RnCommand) => {
  switch (cmd.type) {
    case 'load':
      if (cmd.content !== view.state.doc.toString()) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: cmd.content },
        });
        imageCache.clear();
      }
      break;
    case 'exec':
      runAction(view, cmd.action);
      view.focus();
      break;
    case 'theme':
      isDarkNow = cmd.dark;
      currentTheme = cmd.theme ?? 'default';
      document.documentElement.classList.toggle('dark', cmd.dark);
      if (cmd.theme) {
        document.documentElement.dataset.theme = cmd.theme;
      } else {
        delete document.documentElement.dataset.theme;
      }
      if (cmd.customCss !== undefined) applyCustomCss(cmd.customCss);
      if (currentMode === 'preview') void enterPreview();
      break;
    case 'mode':
      setMode(cmd.mode);
      break;
    case 'insert': {
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: cmd.text },
        selection: { anchor: from + cmd.text.length },
      });
      view.focus();
      break;
    }
    case 'scrollTo': {
      const line = Math.min(Math.max(1, cmd.line), view.state.doc.lines);
      const pos = view.state.doc.line(line).from;
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
      view.focus();
      break;
    }
    case 'settings': {
      const root = document.documentElement;
      if (cmd.fontSize !== undefined) {
        root.style.setProperty('--cm-font-size', `${cmd.fontSize}px`);
      }
      if (cmd.lineHeight !== undefined) {
        root.style.setProperty('--cm-line-height', String(cmd.lineHeight));
      }
      if (cmd.fontFamily !== undefined) {
        root.style.setProperty('--cm-font-family', cmd.fontFamily);
      }
      break;
    }
    case 'keymap':
      view.dispatch({
        effects: keymapComp.reconfigure(keymap.of(buildKeyBindings(cmd.bindings, keymapHandlers))),
      });
      break;
    case 'viewModes': {
      let changed = false;
      if (cmd.focus !== undefined && cmd.focus !== focusEnabled) {
        focusEnabled = cmd.focus;
        changed = true;
      }
      if (cmd.typewriter !== undefined && cmd.typewriter !== typewriterEnabled) {
        typewriterEnabled = cmd.typewriter;
        changed = true;
      }
      if (changed) {
        view.dispatch({
          effects: modesComp.reconfigure(buildModeExtensions()),
        });
      }
      break;
    }
    case 'images':
      handleImages(cmd.map);
      break;
    case 'exportHtml':
      void handleExport(cmd.kind, cmd.forceLight);
      break;
  }
});

// 通知 React Native：编辑器已就绪
postEvent({ type: 'ready' });
