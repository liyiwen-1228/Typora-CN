/**
 * 预览渲染管线（FE-01/02/03/08 + OT-02/03）
 *
 * - KaTeX 数学公式（$...$ 行内 / $$...$$ 块级）
 * - Mermaid 图表（```mermaid 代码块，异步渲染，失败显示错误信息）
 * - GFM 脚注（marked 内置）、==高亮==、[TOC] 目录占位
 * - [[Wiki 链接]] → data-wiki 锚点（点击经桥接由 RN 打开对应笔记）
 * - 相对路径图片经 RN 解析为 data URI（预览与导出均内嵌）
 */
import {
  Marked,
  type RendererObject,
  type Tokens,
  type TokenizerAndRendererExtension,
} from 'marked';
import katex from 'katex';

/** 标题渲染期间收集的标题信息（供 [TOC] 与大纲面板） */
export interface RenderHeading {
  level: number;
  text: string;
  id: string;
}

export interface PreviewResult {
  html: string;
  headings: RenderHeading[];
  /** 与 html 中 .mermaid-src 占位 div 顺序对应的源码 */
  mermaid: string[];
}

export interface PreviewOptions {
  dark: boolean;
  /** 相对路径图片解析器（RN 读取文件 → data URI），可缺省 */
  resolveImage?: (relPath: string) => Promise<string | null>;
}

/** 当前渲染批次的临时状态 */
let renderHeadings: RenderHeading[] = [];
let usedIds = new Map<string, number>();
let mermaidCodes: string[] = [];
/** 脚注定义（label → 内容） */
let footnotes = new Map<string, string>();
let footnoteOrder: string[] = [];
/** 相对路径图片 → data URI 映射（每次渲染前填充） */
let imageMap = new Map<string, string>();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/** 标题锚点：保留中英数字与连字符，重复时加序号 */
function slugify(text: string): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{Script=Han}\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'h';
  const count = usedIds.get(base) ?? 0;
  usedIds.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/** KaTeX 渲染，出错时以错误信息代替（不崩溃） */
function renderMath(text: string, display: boolean): string {
  try {
    return katex.renderToString(text, {
      displayMode: display,
      throwOnError: true,
      strict: false,
      trust: false,
      output: 'html',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<span class="math-error">公式错误：${escapeHtml(msg)}</span>`;
  }
}

/* ---------------- marked 扩展 ---------------- */

const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start(src: string) {
    const idx = src.search(/\$(?!\s)/);
    return idx < 0 ? undefined : idx;
  },
  tokenizer(src: string) {
    // $ 后与闭合 $ 前均不允许空白；闭合 $ 后不能紧跟数字（规避 "$5 和 $10"）
    const m = /^\$(?!\s)([^\n$]*[^\s$])\$(?!\d)/.exec(src);
    if (!m) return;
    return { type: 'inlineMath', raw: m[0], text: m[1] };
  },
  renderer(token) {
    return renderMath((token as unknown as { text: string }).text, false);
  },
};

const blockMath: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start(src: string) {
    const idx = src.search(/\$\$/);
    return idx < 0 ? undefined : idx;
  },
  tokenizer(src: string) {
    const m = /^\$\$([\s\S]+?)\$\$(?:\n+|$)/.exec(src);
    if (!m) return;
    return { type: 'blockMath', raw: m[0], text: m[1].replace(/^\n|\n$/g, '') };
  },
  renderer(token) {
    return `<p class="math-block">${renderMath(
      (token as unknown as { text: string }).text,
      true,
    )}</p>\n`;
  },
};

const highlight: TokenizerAndRendererExtension = {
  name: 'highlight',
  level: 'inline',
  start(src: string) {
    return src.indexOf('==');
  },
  tokenizer(src: string) {
    const m = /^==(?!\s)([^\n=]*[^\s=])==/.exec(src);
    if (!m) return;
    return {
      type: 'highlight',
      raw: m[0],
      tokens: this.lexer.inlineTokens(m[1]),
    };
  },
  renderer(token) {
    const inner = this.parser.parseInline(
      (token as unknown as { tokens: Tokens.Generic[] }).tokens,
    );
    return `<mark>${inner}</mark>`;
  },
};

const wikiLink: TokenizerAndRendererExtension = {
  name: 'wikiLink',
  level: 'inline',
  start(src: string) {
    return src.indexOf('[[');
  },
  tokenizer(src: string) {
    const m = /^\[\[([^\[\]\n]+)\]\]/.exec(src);
    if (!m) return;
    return { type: 'wikiLink', raw: m[0], text: m[1].trim() };
  },
  renderer(token) {
    const title = (token as unknown as { text: string }).text;
    return `<a href="#" class="wiki-link" data-wiki="${escapeHtml(title)}">${escapeHtml(
      title,
    )}</a>`;
  },
};

const tocBlock: TokenizerAndRendererExtension = {
  name: 'toc',
  level: 'block',
  tokenizer(src: string) {
    const m = /^\[TOC\][ \t]*(?:\n+|$)/.exec(src);
    if (!m) return;
    return { type: 'toc', raw: m[0] };
  },
  renderer() {
    return '<div class="toc" data-toc="1"></div>\n';
  },
};

/* ---------------- 脚注（FE-03，marked 15 无内置支持） ---------------- */

/** 行内引用 [^label] */
const footnoteRef: TokenizerAndRendererExtension = {
  name: 'footnoteRef',
  level: 'inline',
  start(src: string) {
    return src.indexOf('[^');
  },
  tokenizer(src: string) {
    const m = /^\[\^([^\s\]]+)\]/.exec(src);
    if (!m) return;
    return { type: 'footnoteRef', raw: m[0], text: m[1] };
  },
  renderer(token) {
    const label = (token as unknown as { text: string }).text;
    if (!footnotes.has(label)) {
      return `<sup class="footnote-ref footnote-missing">[${escapeHtml(label)}]</sup>`;
    }
    return `<sup class="footnote-ref" id="fnref-${escapeHtml(label)}"><a href="#fn-${escapeHtml(
      label,
    )}">[${escapeHtml(label)}]</a></sup>`;
  },
};

/** 定义行 [^label]: 内容（块级，渲染时隐藏，汇总到底部脚注区；缩进 ≥4 空格为续行） */
const footnoteDef: TokenizerAndRendererExtension = {
  name: 'footnoteDef',
  level: 'block',
  start(src: string) {
    // src 为已去掉首字符的切片：返回行首 [^ 中 [ 的位置
    const i = src.search(/\n\[\^/);
    return i < 0 ? undefined : i + 1;
  },
  tokenizer(src: string) {
    const head = /^\[\^([^\s\]]+)\]:[ \t]*/.exec(src);
    if (!head) return;
    const rest = src.slice(head[0].length);
    const lines: string[] = [];
    let end = rest.length;
    // 首行（至行尾，允许为空）
    let nl = rest.indexOf('\n');
    lines.push(nl < 0 ? rest : rest.slice(0, nl));
    let pos = nl < 0 ? rest.length : nl + 1;
    end = pos;
    // 缩进 ≥4 空格的行作为续行
    while (pos < rest.length) {
      nl = rest.indexOf('\n', pos);
      const line = nl < 0 ? rest.slice(pos) : rest.slice(pos, nl);
      if (!/^ {4}/.test(line)) break;
      lines.push(line.slice(4));
      pos = nl < 0 ? rest.length : nl + 1;
      end = pos;
    }
    const label = head[1];
    const prev = footnotes.get(label) ?? '';
    const text = lines.map((l) => l.trim()).filter((l) => l.length > 0).join('\n');
    footnotes.set(label, prev ? `${prev}\n${text}` : text);
    if (!prev) footnoteOrder.push(label);
    return { type: 'footnoteDef', raw: src.slice(0, head[0].length + end), text };
  },
  renderer() {
    return '';
  },
};

/* ---------------- marked 实例 ---------------- */

const marked = new Marked({ gfm: true, breaks: false });

const rendererObj: RendererObject = {
  heading(token: Tokens.Heading) {
    const text = this.parser.parseInline(token.tokens);
    const plain = stripTags(text).trim();
    const id = slugify(plain);
    renderHeadings.push({ level: token.depth, text: plain, id });
    return `<h${token.depth} id="${id}">${text}</h${token.depth}>\n`;
  },
  code(token: Tokens.Code) {
    const lang = (token.lang || '').trim().split(/\s+/)[0];
    if (lang === 'mermaid') {
      mermaidCodes.push(token.text);
      return `<div class="mermaid-src" data-mmd="${mermaidCodes.length - 1}"></div>\n`;
    }
    const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    return `<pre><code${cls}>${escapeHtml(token.text)}</code></pre>\n`;
  },
  image(token: Tokens.Image) {
    const src = imageMap.get(token.href) ?? token.href;
    const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(token.text || '')}"${title} />`;
  },
};

marked.use({
  extensions: [inlineMath, blockMath, highlight, wikiLink, tocBlock, footnoteRef, footnoteDef],
  renderer: rendererObj,
});

/** 剥离 YAML front matter（元数据不进入预览，避免被解析为 setext 标题） */
function stripFrontMatter(src: string): string {
  const m = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/.exec(src);
  return m ? src.slice(m[0].length) : src;
}

/** 从 Markdown 源码中收集相对路径图片引用 */
function collectRelativeImages(src: string): string[] {
  const out = new Set<string>();
  const re = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?[^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const url = m[1];
    if (/^(https?:|data:|file:|blob:)/i.test(url)) continue;
    out.add(url);
  }
  return [...out];
}

/** 渲染 Markdown → 预览 HTML（含 TOC 填充与安全过滤） */
export async function buildPreviewHtml(
  src: string,
  opts: PreviewOptions,
): Promise<PreviewResult> {
  renderHeadings = [];
  usedIds = new Map();
  mermaidCodes = [];
  imageMap = new Map();
  footnotes = new Map();
  footnoteOrder = [];

  if (opts.resolveImage) {
    const rels = collectRelativeImages(stripFrontMatter(src));
    if (rels.length > 0) {
      const values = await Promise.all(
        rels.map((rel) => opts.resolveImage!(rel).catch(() => null)),
      );
      rels.forEach((rel, i) => {
        const data = values[i];
        if (data) imageMap.set(rel, data);
      });
    }
  }

  const rawHtml = marked.parse(stripFrontMatter(src)) as string;
  let html = sanitize(rawHtml);

  // 填充 [TOC]
  if (html.includes('data-toc="1"')) {
    html = html.replace(
      /<div class="toc" data-toc="1"><\/div>/g,
      () => buildTocHtml(renderHeadings),
    );
  }

  // 汇总脚注区（FE-03）
  if (footnoteOrder.length > 0) {
    const items = footnoteOrder
      .map((label) => {
        const body = marked.parseInline(footnotes.get(label) ?? '');
        return `<li id="fn-${escapeHtml(label)}">${body} <a class="footnote-backref" href="#fnref-${escapeHtml(
          label,
        )}">↩</a></li>`;
      })
      .join('\n');
    html += `\n<section class="footnotes" data-footnotes>\n<hr>\n<ol>\n${items}\n</ol>\n</section>\n`;
    html = sanitize(html);
  }

  return { html, headings: renderHeadings, mermaid: mermaidCodes };
}

function buildTocHtml(headings: RenderHeading[]): string {
  if (headings.length === 0) return '<div class="toc toc-empty">（无标题）</div>';
  const items = headings
    .map(
      (h) =>
        `<li class="toc-l${h.level}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`,
    )
    .join('\n');
  return `<div class="toc"><div class="toc-title">目录</div><ul class="toc-list">\n${items}\n</ul></div>`;
}

/** 移除脚本类元素与内联事件属性，防止预览内容执行任意代码 */
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, form').forEach((el) => {
    el.remove();
  });
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (
        (name === 'href' || name === 'src' || name === 'xlink:href') &&
        value.startsWith('javascript:')
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

/* ---------------- Mermaid 异步渲染 ---------------- */

type MermaidModule = (typeof import('mermaid'))['default'];
let mermaidMod: MermaidModule | null = null;

async function ensureMermaid(dark: boolean): Promise<MermaidModule> {
  if (!mermaidMod) {
    mermaidMod = (await import('mermaid')).default;
  }
  mermaidMod.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    securityLevel: 'strict',
  });
  return mermaidMod;
}

/** 把已插入 DOM 的 .mermaid-src 占位 div 渲染为 SVG（失败显示错误信息） */
export async function enhanceMermaid(
  root: HTMLElement,
  result: PreviewResult,
  dark: boolean,
): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-src'));
  if (blocks.length === 0) return;
  const mermaid = await ensureMermaid(dark);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const code = result.mermaid[i] ?? '';
    try {
      const id = `mmd-${Date.now()}-${i}-${Math.floor(Math.random() * 1e6)}`;
      const { svg } = await mermaid.render(id, code);
      block.innerHTML = svg;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      block.innerHTML = `<div class="mermaid-error">Mermaid 渲染失败：${escapeHtml(msg)}</div>`;
    }
  }
}

/* ---------------- 导出自包含 HTML（OT-02/03） ---------------- */

/** 收集页面内全部 <style>（模板样式 + KaTeX + 自定义 CSS） */
export function collectCss(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const s = sheet as CSSStyleSheet;
      if (!(s.ownerNode instanceof HTMLStyleElement)) continue;
      const rules = s.cssRules;
      for (let i = 0; i < rules.length; i++) {
        parts.push(rules[i].cssText);
      }
    } catch {
      // 跳过不可访问的样式表
    }
  }
  return parts.join('\n');
}

/** 组装导出文档：自包含 HTML，效果与 App 预览一致 */
export function buildExportDocument(
  contentHtml: string,
  opts: { title: string; dark: boolean; theme?: string },
): string {
  const themeAttr =
    opts.theme && opts.theme !== 'default' ? ` data-theme="${escapeHtml(opts.theme)}"` : '';
  const darkAttr = opts.dark ? ' class="dark"' : '';
  return (
    `<!DOCTYPE html>\n<html lang="zh-CN"${darkAttr}${themeAttr}>\n<head>\n` +
    `<meta charset="utf-8" />\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />\n` +
    `<title>${escapeHtml(opts.title)}</title>\n` +
    `<style>\n${collectCss()}\n` +
    `/* 导出覆盖：取消预览容器的滚动约束 */\n` +
    `body{margin:0;padding:0} #preview{height:auto;overflow:visible}\n` +
    `</style>\n` +
    `</head>\n<body>\n<div id="preview">\n${contentHtml}\n</div>\n</body>\n</html>\n`
  );
}
