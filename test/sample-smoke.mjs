/**
 * 首启示例笔记渲染冒烟测试：SAMPLE_NOTE_CONTENT 经 buildPreviewHtml 渲染，
 * 断言一期全部感知层特性均有产物（KaTeX / Mermaid / 脚注 / TOC / 高亮 / 双链 /
 * 任务列表 / 表格 / front matter 剥离）。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'typora-cn-smoke-'));
const bundle = (entry, out) => {
  const r = spawnSync(
    join(root, 'webview-editor', 'node_modules', '.bin', 'esbuild'),
    [join(root, entry), '--bundle', '--format=cjs', '--platform=node', '--target=node18', `--outfile=${out}`, '--legal-comments=none'],
    { stdio: 'ignore', shell: process.platform === 'win32' },
  );
  if (r.status !== 0) {
    console.error(`esbuild 打包 ${entry} 失败`);
    process.exit(1);
  }
};
bundle('webview-editor/src/preview.ts', join(dir, 'preview.cjs'));
bundle('src/storage/sampleNote.ts', join(dir, 'sample.cjs'));

globalThis.DOMParser = class {
  parseFromString(html) {
    return { body: { innerHTML: html }, querySelectorAll: () => [] };
  }
};
const { buildPreviewHtml } = await import(pathToFileURL(join(dir, 'preview.cjs')).href);
const { SAMPLE_NOTE_CONTENT } = await import(pathToFileURL(join(dir, 'sample.cjs')).href);

const res = await buildPreviewHtml(SAMPLE_NOTE_CONTENT, { dark: false });

let failed = 0;
const check = (name, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failed += 1;
};

check('行内 KaTeX', res.html.includes('<span class="katex">'));
check('块级 KaTeX', res.html.includes('katex-display'));
check('无公式错误', !res.html.includes('math-error'));
check('Mermaid 三图', res.mermaid.length === 3);
check('Mermaid 流程图源', res.mermaid[0].includes('flowchart TD'));
check('Mermaid 时序图源', res.mermaid[1].includes('sequenceDiagram'));
check('Mermaid 饼图源', res.mermaid[2].includes('pie title'));
check('脚注区', res.html.includes('data-footnotes'));
check('TOC 目录', res.html.includes('<ul class="toc-list">'));
check('高亮 mark', res.html.includes('<mark>'));
check('双链 wiki-link', res.html.includes('class="wiki-link"'));
check('任务列表 checkbox', res.html.includes('type="checkbox"'));
check('表格', res.html.includes('<table>'));
check('front matter 剥离', !res.html.includes('tags: [入门, 指南]'));
check('标题树 8 个标题', res.headings.length === 8);

if (failed > 0) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('\n示例笔记冒烟测试通过');
