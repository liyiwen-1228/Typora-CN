import { EditorView } from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import type { EditorAction } from './protocol';

/** 工具栏动作入口：按动作分发到 CodeMirror 命令或自定义实现 */
export function runAction(view: EditorView, action: EditorAction): boolean {
  switch (action) {
    case 'find':
      openSearchPanel(view);
      return true;
    case 'undo':
      return undo(view);
    case 'redo':
      return redo(view);
    case 'bold':
      return wrapInline(view, '**');
    case 'italic':
      return wrapInline(view, '*');
    case 'inlineCode':
      return wrapInline(view, '`');
    case 'strikethrough':
      return wrapInline(view, '~~');
    case 'link':
      return insertLink(view);
    case 'image':
      return insertImage(view);
    case 'heading1':
      return setHeading(view, 1);
    case 'heading2':
      return setHeading(view, 2);
    case 'heading3':
      return setHeading(view, 3);
    case 'heading4':
      return setHeading(view, 4);
    case 'heading5':
      return setHeading(view, 5);
    case 'heading6':
      return setHeading(view, 6);
    case 'quote':
      return toggleLinePrefix(view, /^>\s?/, (text) => `> ${text}`);
    case 'bulletList':
      return toggleLinePrefix(view, /^[-*+]\s+/, (text) => `- ${text}`);
    case 'orderedList':
      return toggleLinePrefix(view, /^\d+[.)]\s+/, (text, index) => `${index + 1}. ${text}`);
    case 'taskList':
      return toggleLinePrefix(view, /^[-*+]\s\[[ xX]\]\s+/, (text) => `- [ ] ${text}`);
    case 'table':
      return insertTable(view);
    case 'codeBlock':
      return wrapBlock(view, '```\n', '\n```\n');
    case 'hr':
      return insertHorizontalRule(view);
    case 'clearFormat':
      return clearFormat(view);
    case 'formatTable':
      return formatTable(view);
    default:
      return false;
  }
}

/** 清除格式（⌘\）：移除选中内容的行内标记与所选行的行首标记 */
function clearFormat(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const hasSelection = to > from;
  let text = view.state.sliceDoc(from, to);
  if (!hasSelection) {
    // 无选中时对当前词清除行内标记
    const line = view.state.doc.lineAt(from);
    const word = line.text.slice(0, from - line.from).match(/[\w\u3400-\u9fff\u3040-\u30ff]+$/);
    const wordEnd = line.text.slice(to - line.from).match(/^[\w\u3400-\u9fff\u3040-\u30ff]+/);
    const start = from - (word ? word[0].length : 0);
    const end = to + (wordEnd ? wordEnd[0].length : 0);
    const selected = view.state.sliceDoc(start, end);
    const cleaned = stripInlineMarks(selected);
    if (cleaned === selected) return true;
    view.dispatch({
      changes: { from: start, to: end, insert: cleaned },
      selection: { anchor: start + cleaned.length },
    });
    return true;
  }
  const inlineStripped = stripInlineMarks(text);
  // 逐行剥离行首标记（标题/引用/列表/任务框）
  const lineStripped = inlineStripped
    .split('\n')
    .map((line) => line.replace(/^(\s*)(#{1,6}\s+|>\s?|[-*+]\s\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/, '$1'))
    .join('\n');
  view.dispatch({
    changes: { from, to, insert: lineStripped },
    selection: { anchor: from + lineStripped.length },
  });
  return true;
}

/** 移除行内 Markdown 标记，保留内容文字 */
function stripInlineMarks(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/_([^_\n]+)_/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/==([^=]+)==/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\[([^\]]+)\]\]/g, '$1');
  }
  return out;
}

/** 表格美化（EX-03）：光标所在表格列宽对齐 + 对齐标记规范化 */
function formatTable(view: EditorView): boolean {
  const { from } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from);
  const isTableRow = (text: string) => /^\s*\|.*\|\s*$/.test(text);
  const isSepRow = (text: string) =>
    /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(text) && text.includes('-');
  if (!isTableRow(startLine.text)) return false;

  let first = startLine.number;
  while (first > 1 && isTableRow(view.state.doc.line(first - 1).text)) first -= 1;
  let last = startLine.number;
  const total = view.state.doc.lines;
  while (last < total && isTableRow(view.state.doc.line(last + 1).text)) last += 1;

  const lines: string[] = [];
  for (let n = first; n <= last; n++) lines.push(view.state.doc.line(n).text);
  if (lines.length < 2 || !isSepRow(lines[1])) return false;

  const splitRow = (text: string) => {
    const body = text.trim().replace(/^\|/, '').replace(/\|$/, '');
    return body.split('|').map((cell) => cell.trim());
  };
  const header = splitRow(lines[0]);
  const cols = header.length;
  const alignments = splitRow(lines[1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center' as const;
    if (right) return 'right' as const;
    return 'left' as const;
  });
  const rows = lines.slice(2).map(splitRow).filter((cells) => cells.length > 0);

  // 显示宽度：CJK/全角按 2 计
  const width = (text: string) => {
    let w = 0;
    for (const ch of text) {
      w += /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffff]/.test(ch)
        ? 2
        : 1;
    }
    return w;
  };
  const widths: number[] = new Array(cols).fill(0);
  const allRows = [header, ...rows];
  for (const cells of allRows) {
    for (let c = 0; c < cols; c++) {
      widths[c] = Math.max(widths[c], width(cells[c] ?? ''));
    }
  }
  const pad = (text: string, col: number) => {
    const w = width(text);
    const spaces = Math.max(0, widths[col] - w);
    if (alignments[col] === 'center') {
      const left = Math.floor(spaces / 2);
      const right = spaces - left;
      return ' '.repeat(left) + text + ' '.repeat(right);
    }
    if (alignments[col] === 'right') return ' '.repeat(spaces) + text;
    return text + ' '.repeat(spaces);
  };
  const sepMark = (col: number) => {
    const marks = '-'.repeat(Math.max(3, widths[col]));
    if (alignments[col] === 'center') return `:${marks}:`;
    if (alignments[col] === 'right') return `${marks}:`;
    return marks;
  };
  const buildRow = (cells: string[]) =>
    `| ${Array.from({ length: cols }, (_, c) => pad(cells[c] ?? '', c)).join(' | ')} |`;

  const output = [
    buildRow(header),
    `| ${Array.from({ length: cols }, (_, c) => sepMark(c)).join(' | ')} |`,
    ...rows.map(buildRow),
  ].join('\n');

  const fromPos = view.state.doc.line(first).from;
  const toPos = view.state.doc.line(last).to;
  view.dispatch({
    changes: { from: fromPos, to: toPos, insert: output },
    selection: { anchor: fromPos + output.length },
  });
  return true;
}

/** 行首前缀整体切换：所有选中行都已有该前缀 → 全部移除，否则全部添加 */
function toggleLinePrefix(
  view: EditorView,
  pattern: RegExp,
  build: (text: string, index: number) => string,
): boolean {
  const groups: { from: number; to: number; text: string }[][] = [];
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number;
    const last = view.state.doc.lineAt(range.to).number;
    const lines: { from: number; to: number; text: string }[] = [];
    for (let n = first; n <= last; n++) {
      const line = view.state.doc.line(n);
      lines.push({ from: line.from, to: line.to, text: line.text });
    }
    groups.push(lines);
  }
  const allLines = groups.flat();
  const allHavePrefix = allLines.every(({ text }) => pattern.test(text));
  const changes = groups.flatMap((lines, gi) =>
    lines.map(({ from, to, text }, i) => {
      const stripped = text.replace(pattern, '');
      const next = allHavePrefix ? stripped : build(stripped, gi === 0 ? i : i);
      return { from, to, insert: next };
    }),
  );
  view.dispatch({ changes });
  return true;
}

/** 设置/取消标题：全部行已是该级别 → 取消，否则设置为该级别 */
function setHeading(view: EditorView, level: number): boolean {
  const prefix = `${'#'.repeat(level)} `;
  const pattern = /^(#{1,6})\s+/;
  const lines: { from: number; to: number; text: string }[] = [];
  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number;
    const last = view.state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      const line = view.state.doc.line(n);
      lines.push({ from: line.from, to: line.to, text: line.text });
    }
  }
  const allAtLevel = lines.every(({ text }) => {
    const m = pattern.exec(text);
    return m !== null && m[1].length === level;
  });
  view.dispatch({
    changes: lines.map(({ from, to, text }) => {
      const m = pattern.exec(text);
      const body = m ? text.slice(m[0].length) : text;
      return { from, to, insert: allAtLevel ? body : prefix + body };
    }),
  });
  return true;
}

/** 行内标记包裹：选中内容已带标记 → 取消包裹；无选中 → 插入成对标记并把光标落在中间 */
function wrapInline(view: EditorView, mark: string): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  if (
    selected.length >= mark.length * 2 &&
    selected.startsWith(mark) &&
    selected.endsWith(mark)
  ) {
    view.dispatch({
      changes: {
        from,
        to,
        insert: selected.slice(mark.length, selected.length - mark.length),
      },
    });
    return true;
  }
  if (selected.length === 0) {
    view.dispatch({
      changes: { from, to, insert: `${mark}${mark}` },
      selection: { anchor: from + mark.length },
    });
  } else {
    view.dispatch({
      changes: { from, to, insert: `${mark}${selected}${mark}` },
      selection: { anchor: from + mark.length, head: from + mark.length + selected.length },
    });
  }
  return true;
}

/** 块级包裹（如代码块围栏） */
function wrapBlock(view: EditorView, before: string, after: string): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: before + selected + after },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
  });
  return true;
}

/** 插入链接：无选中时选中“链接文字”，有选中时选中默认 URL 便于直接输入 */
function insertLink(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const text = selected.length > 0 ? selected : '链接文字';
  view.dispatch({
    changes: { from, to, insert: `[${text}](https://)` },
    selection: { anchor: from + text.length + 3, head: from + text.length + 11 },
  });
  return true;
}

/** 插入图片模板 */
function insertImage(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const alt = selected.length > 0 ? selected : '图片描述';
  view.dispatch({
    changes: { from, to, insert: `![${alt}](https://)` },
    selection: { anchor: from + alt.length + 4, head: from + alt.length + 12 },
  });
  return true;
}

/** 插入 3×3 表格并选中第一个表头 */
function insertTable(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const table =
    '| 表头一 | 表头二 | 表头三 |\n' +
    '| --- | --- | --- |\n' +
    '| 内容 | 内容 | 内容 |\n' +
    '| 内容 | 内容 | 内容 |\n';
  view.dispatch({
    changes: { from, to, insert: table },
    selection: { anchor: from + 2, head: from + 5 },
  });
  return true;
}

/** 在当前行下方插入分隔线 */
function insertHorizontalRule(view: EditorView): boolean {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const insert = (line.text.length > 0 ? '\n\n' : '') + '---\n\n';
  view.dispatch({
    changes: { from: line.to, insert },
    selection: { anchor: line.to + insert.length },
  });
  return true;
}
