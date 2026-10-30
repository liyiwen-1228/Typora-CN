/**
 * 聚焦模式 / 打字机模式（EX-06）
 * - 聚焦：非当前段落（块）变暗
 * - 打字机：光标行保持屏幕中部
 * 两种模式独立开关，互不干扰。
 */
import {
  Decoration,
  EditorView,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const dimLine = Decoration.line({ class: 'cm-dim-line' });

/** 判断一行是否为标题行（标题独立成块） */
function isHeadingLine(text: string): boolean {
  return /^#{1,6}\s/.test(text);
}

/** 计算需要变暗的行：块 = 空行分隔的连续非空行，标题行独立成块；光标所在块不变暗 */
function buildDimDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const cursor = doc.lineAt(view.state.selection.main.head).number;
  const builder = new RangeSetBuilder<Decoration>();
  let start = 1;
  const closeBlock = (end: number) => {
    if (end < start) return;
    if (!(cursor >= start && cursor <= end)) {
      for (let n = start; n <= end; n++) {
        const line = doc.line(n);
        builder.add(line.from, line.from, dimLine);
      }
    }
    start = end + 1;
  };
  for (let n = 1; n <= doc.lines; n++) {
    const text = doc.line(n).text;
    if (!text.trim()) {
      closeBlock(n - 1);
      start = Math.max(start, n + 1);
      continue;
    }
    if (isHeadingLine(text)) {
      closeBlock(n - 1);
      closeBlock(n);
    }
  }
  closeBlock(doc.lines);
  return builder.finish();
}

/** 聚焦模式插件：内容或选择变化时重算变暗范围 */
export function focusModeExtension() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDimDecorations(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDimDecorations(update.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

/** 打字机模式：光标行变化时平滑滚动到屏幕中部 */
export function typewriterExtension() {
  const lastLine = new WeakMap<EditorView, number>();
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet) return;
    const view = update.view;
    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    if (lastLine.get(view) === line) return;
    lastLine.set(view, line);
    requestAnimationFrame(() => {
      const current = view.state.doc.lineAt(view.state.selection.main.head).number;
      if (current !== line) return; // 光标又移动了，交给下一次
      const pos = view.state.doc.line(current).from;
      view.dispatch({
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
    });
  });
}
