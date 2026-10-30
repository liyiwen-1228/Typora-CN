/**
 * 预览管线 Node 侧验证脚本（无浏览器环境）：
 * 用 esbuild 打包 preview.ts 至 node 格式，stub DOMParser 后运行断言。
 * 覆盖：行内/块级公式、公式错误、==高亮==、[TOC]、Wiki 链接、脚注、
 * 标题锚点、图片 data URI 替换、mermaid 占位、$5/$10 货币误判防护。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'typora-cn-test-'));
const outFile = join(dir, 'preview.cjs');

// esbuild 经 CLI 子进程调用（避免 JS API 的管道通信，见 build.mjs）
const r = spawnSync(
  join(root, '..', 'node_modules', '.bin', 'esbuild'),
  [
    join(root, '..', 'src', 'preview.ts'),
    '--bundle',
    '--format=cjs',
    '--platform=node',
    '--target=node18',
    `--outfile=${outFile}`,
    '--legal-comments=none',
  ],
  { stdio: 'ignore', shell: process.platform === 'win32' },
);
if (r.status !== 0) {
  console.error('esbuild 打包测试失败');
  process.exit(1);
}

// DOMParser 打桩：sanitize() 只做遍历移除，node 环境下以恒等实现验证管线其余部分
globalThis.DOMParser = class {
  parseFromString(html) {
    return { body: { innerHTML: html }, querySelectorAll: () => [] };
  }
};

const { buildPreviewHtml } = await import(pathToFileURL(outFile).href);

let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${detail}`);
  }
}

const md = [
  '---',
  'title: 测试笔记',
  'tags: [a, b]',
  '---',
  '',
  '# 标题一',
  '',
  '[TOC]',
  '',
  '## 数学',
  '',
  '行内公式 $E = mc^2$ 与 $x_i^2$。价格 $5 和 $10 不应渲染。',
  '',
  '$$',
  '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
  '$$',
  '',
  '坏公式 $\\frac{$ 哦$ 测试。',
  '',
  '## 扩展',
  '',
  '==高亮文字== 与 [[目标笔记]] 链接，外链 [b](https://x.com)。',
  '',
  '图片 ![pic](assets/a.png) 引用。',
  '',
  '```mermaid',
  'flowchart TD',
  '  A --> B',
  '```',
  '',
  '```js',
  'const x = 1;',
  '```',
  '',
  '脚注引用[^1]',
  '',
  '[^1]: 注释内容',
  '',
  '### 三级',
  '',
  '| a | b |',
  '| --- | --- |',
  '| 1 | 2 |',
].join('\n');

const result = await buildPreviewHtml(md, {
  dark: false,
  resolveImage: async (rel) => (rel === 'assets/a.png' ? 'data:image/png;base64,QUJD' : null),
});

const html = result.html;

console.log('FE-01 数学公式');
const katexCount = (html.match(/class="katex"/g) || []).length;
check(
  '行内公式渲染 KaTeX（2 行内 + 1 块级 = 3 处）',
  katexCount >= 3,
  `实际 katex 数量 ${katexCount}`,
);
check('块级公式渲染 display', /katex-display/.test(html), '需包含 katex-display');
check('公式错误显示错误信息', html.includes('math-error'), '需包含 math-error span');
check('货币 $5/$10 不渲染为公式', !/katex[^"]*">\s*5\s*和/.test(html), '货币不应进 katex');

console.log('FE-03 高亮/TOC/脚注');
check('==高亮== → <mark>', html.includes('<mark>高亮文字</mark>'), html.slice(html.indexOf('高亮') - 60, html.indexOf('高亮') + 40));
check('[TOC] 展开目录', html.includes('toc-title') && html.includes('标题一'), '需包含 toc 与标题');
check('TOC 锚点链接', /href="#[^"]*"\s*>标题一</.test(html), html.match(/toc-list[\s\S]{0,300}/)?.[0] ?? '');
check('标题带 id', /<h1 id="[^"]+">/.test(html), 'h1 需带 id');
check('脚注渲染', html.includes('footnotes') && html.includes('注释内容'), '需包含 footnotes');

console.log('FE-08 Wiki 链接');
check('[[目标笔记]] → wiki-link', /class="wiki-link" data-wiki="目标笔记"/.test(html), '需含 data-wiki');

console.log('EX-02 图片解析');
check('相对路径图片替换为 data URI', /<img src="data:image\/png;base64,QUJD"/.test(html), html.match(/<img[^>]*pic[^>]*>/)?.[0] ?? '');

console.log('FE-02 Mermaid');
check('mermaid 占位 div', /class="mermaid-src" data-mmd="0"/.test(html), '需含 mermaid 占位');
check('mermaid 源码收集', result.mermaid.length === 1 && result.mermaid[0].includes('flowchart TD'), JSON.stringify(result.mermaid));

console.log('代码块与表格');
check('普通代码块渲染', html.includes('<pre><code class="language-js"'), '需含 language-js');
check('GFM 表格渲染', html.includes('<table>'), '需含 table');

console.log('标题树与 front matter');
check(
  'front matter 不进入渲染（首个标题是「标题一」）',
  result.headings.length > 0 && result.headings[0].text === '标题一' && result.headings[0].level === 1,
  JSON.stringify(result.headings.map((h) => [h.level, h.text])),
);
check('front matter 元数据不出现在正文', !html.includes('tags: [a, b]'), 'front matter 应剥离');

if (failed > 0) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('\n预览管线全部断言通过');
