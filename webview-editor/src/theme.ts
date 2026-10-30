import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/** 编辑器基础主题（颜色全部走 CSS 变量，配合 html.dark 切换深浅色） */
export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--cm-fg)',
    backgroundColor: 'var(--cm-bg)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: 'var(--cm-font-family)',
    lineHeight: 'var(--cm-line-height)',
    fontSize: 'var(--cm-font-size)',
  },
  '.cm-content': {
    caretColor: 'var(--cm-accent)',
    padding: '8px 4px 30vh',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--cm-bg)',
    color: 'var(--cm-gutter)',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--cm-active-line)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--cm-selection) !important',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--cm-accent)',
    borderLeftWidth: '2px',
  },
});

/** Markdown / 代码块语法高亮配色（同样使用 CSS 变量） */
export const editorHighlightStyle = HighlightStyle.define([
  { tag: t.heading, fontWeight: '600', color: 'var(--cm-heading)' },
  { tag: t.strong, fontWeight: '700', color: 'var(--cm-heading)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--cm-accent)' },
  { tag: t.url, color: 'var(--cm-url)', textDecoration: 'underline' },
  {
    tag: [t.monospace, t.special(t.variableName)],
    color: 'var(--cm-code)',
    backgroundColor: 'var(--cm-code-bg)',
  },
  { tag: t.quote, color: 'var(--cm-quote)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--cm-accent)', fontWeight: '600' },
  { tag: [t.processingInstruction, t.contentSeparator], color: 'var(--cm-meta)' },
  { tag: [t.keyword, t.moduleKeyword, t.controlKeyword], color: 'var(--cm-kw)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--cm-str)' },
  { tag: [t.number, t.bool], color: 'var(--cm-num)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: [t.className, t.typeName], color: 'var(--cm-type)' },
  { tag: [t.function(t.variableName), t.definition(t.variableName)], color: 'var(--cm-fn)' },
]);

export const editorHighlighting = syntaxHighlighting(editorHighlightStyle, { fallback: true });
