import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { onCommand, postEvent } from './bridge';
import { runAction } from './commands';
import { renderMarkdown } from './preview';
import { editorHighlighting, editorTheme } from './theme';

const editorHost = document.getElementById('editor') as HTMLDivElement;
const previewEl = document.getElementById('preview') as HTMLDivElement;

/** 字数统计：中日韩字符按“字”计，拉丁/数字连续串按“词”计 */
function countWords(text: string): number {
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjk + latin;
}

let postTimer: number | undefined;
let lastPostAt = 0;
let view: EditorView;

/** 上报当前状态（内容 + 光标行 + 统计） */
function postChange(state: EditorState): void {
  const content = state.doc.toString();
  postEvent({
    type: 'change',
    content,
    cursorLine: state.doc.lineAt(state.selection.main.head).number,
    totalLines: state.doc.lines,
    charCount: content.length,
    wordCount: countWords(content),
  });
}

/** 内容/光标变化 300ms 节流上报（尾部保证最后一次变化必达） */
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
      bracketMatching(),
      closeBrackets(),
      editorHighlighting,
      markdown({ codeLanguages: languages }),
      editorTheme,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
        {
          // 硬件键盘 Cmd/Ctrl+S 立即保存
          key: 'Mod-s',
          run: () => {
            postEvent({ type: 'save', content: view.state.doc.toString() });
            return true;
          },
        },
        { key: 'Mod-b', run: () => runAction(view, 'bold') },
        { key: 'Mod-i', run: () => runAction(view, 'italic') },
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) schedulePost();
      }),
    ],
  }),
});

/** 切换 编辑/预览 模式 */
function setMode(mode: 'edit' | 'preview'): void {
  if (mode === 'preview') {
    previewEl.innerHTML = renderMarkdown(view.state.doc.toString());
    editorHost.style.display = 'none';
    previewEl.style.display = 'block';
  } else {
    previewEl.style.display = 'none';
    editorHost.style.display = 'block';
    view.focus();
  }
}

// 处理 RN 侧命令
onCommand((cmd) => {
  switch (cmd.type) {
    case 'load':
      if (cmd.content !== view.state.doc.toString()) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: cmd.content },
        });
      }
      break;
    case 'exec':
      runAction(view, cmd.action);
      view.focus();
      break;
    case 'theme':
      document.documentElement.classList.toggle('dark', cmd.dark);
      break;
    case 'mode':
      setMode(cmd.mode);
      break;
  }
});

// 通知 React Native：编辑器已就绪
postEvent({ type: 'ready' });
