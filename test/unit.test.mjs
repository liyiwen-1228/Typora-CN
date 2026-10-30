/**
 * RN 侧纯逻辑验证（Node 环境经 esbuild 打包后断言）：
 * - 快捷键注册表（§9.2 默认表、§9.3 冲突检测）
 * - front matter 解析（FE-04）
 * - 简繁转换（XT-03）
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function dirname(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

const dir = mkdtempSync(join(tmpdir(), 'typora-cn-unit-'));
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

bundle('src/commands/registry.ts', join(dir, 'registry.cjs'));
bundle('src/storage/frontMatter.ts', join(dir, 'frontMatter.cjs'));
bundle('src/convert/opencc.ts', join(dir, 'opencc.cjs'));

const registry = await import(pathToFileURL(join(dir, 'registry.cjs')).href);
const { parseFrontMatter } = await import(pathToFileURL(join(dir, 'frontMatter.cjs')).href);
const { convertChinese } = await import(pathToFileURL(join(dir, 'opencc.cjs')).href);

let failed = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${detail}`);
  }
}

console.log('EX-04 快捷键默认表（§9.2）');
const defaults = registry.defaultKeymap();
check('共 26 条默认快捷键', Object.keys(defaults).length >= 24, `实际 ${Object.keys(defaults).length}`);
check('保存 Mod-s', defaults.save === 'Mod-s', defaults.save);
check('全局搜索 Mod-Shift-f', defaults.globalSearch === 'Mod-Shift-f', defaults.globalSearch);
check('大纲 Mod-Shift-1', defaults.outline === 'Mod-Shift-1', defaults.outline);
check('标题1-6 Mod-1..6', defaults.heading1 === 'Mod-1' && defaults.heading6 === 'Mod-6', `${defaults.heading1} ${defaults.heading6}`);
check('撤销/重做', defaults.undo === 'Mod-z' && defaults.redo === 'Shift-Mod-z', `${defaults.undo} ${defaults.redo}`);
check('查找 Mod-f', defaults.find === 'Mod-f', defaults.find);

console.log('EX-08 组合键规范化');
check('规范化顺序 Mod-Alt-Shift-base', registry.normalizeCombo('Shift-Alt-Mod-a') === 'Mod-Alt-Shift-a', registry.normalizeCombo('Shift-Alt-Mod-a'));
check('Ctrl 等价 Mod', registry.normalizeCombo('Ctrl-a') === 'Mod-a', registry.normalizeCombo('Ctrl-a'));
check('大小写折叠', registry.normalizeCombo('Mod-B') === 'Mod-b', registry.normalizeCombo('Mod-B'));

console.log('EX-08 冲突检测（§9.3）');
const eff = registry.effectiveKeymap({});
// ① 命令冲突：把 bold 的组合赋给 italic
check('① 命令冲突被识别', registry.validateCombo('Mod-b', eff, 'italic').kind === 'conflict', JSON.stringify(registry.validateCombo('Mod-b', eff, 'italic')));
check('① 冲突给出占用方（命令名）', registry.validateCombo('Mod-b', eff, 'italic').conflictWith === '加粗', 'conflictWith 应为 加粗');
// ② 系统保留
const sys = registry.validateCombo('Mod-h', eff, 'italic');
check('② 系统保留被拒绝', !sys.ok && sys.kind === 'reserved', JSON.stringify(sys));
// ③ 文本编辑键
const txt = registry.validateCombo('Mod-c', eff, 'italic');
check('③ 文本编辑键被拒绝', !txt.ok && txt.kind === 'text', JSON.stringify(txt));
// 自身原组合允许
check('自身组合允许修改', registry.validateCombo(defaults.italic, eff, 'italic').ok, JSON.stringify(registry.validateCombo(defaults.italic, eff, 'italic')));
// 新可用组合
check('新组合可用', registry.validateCombo('Mod-Alt-9', eff, 'italic').ok, JSON.stringify(registry.validateCombo('Mod-Alt-9', eff, 'italic')));
// 生效表覆盖
const custom = registry.effectiveKeymap({ italic: 'Mod-Alt-9' });
check('覆盖生效且原键清除', custom.italic === 'Mod-Alt-9', custom.italic);
check('组合键显示 ⌘⌥9', registry.comboToDisplay('Mod-Alt-Shift-9') === '⌘⌥⇧9', registry.comboToDisplay('Mod-Alt-Shift-9'));

console.log('FE-04 front matter');
const r1 = parseFrontMatter('---\ntitle: 我的笔记\ntags: [a, b, #标签]\ndate: 2024-01-01\n---\n\n# H\n正文');
check('标题解析', r1.fm?.title === '我的笔记', r1.fm?.title);
check('标签解析（去 # 前缀）', r1.fm?.tags.join(',') === 'a,b,标签', r1.fm?.tags.join(','));
check('日期解析', r1.fm?.date === '2024-01-01', r1.fm?.date);
check('正文剥离', r1.body.startsWith('# H'), r1.body.slice(0, 12));
const r2 = parseFrontMatter('# 无 front matter');
check('无 front matter 返回 null', r2.fm === null && r2.body.startsWith('#'), r2.fm?.title ?? 'null');
const r3 = parseFrontMatter('---\ntitle: 测试\n---\n');
check('仅 front matter 无正文', r3.fm?.title === '测试' && r3.body.trim() === '', JSON.stringify(r3.body));

console.log('XT-03 简繁转换');
const s2t = convertChinese('英语学习软件与代码 code', 'traditional');
check('简→繁', s2t === '英語學習軟件與代碼 code', s2t);
const t2s = convertChinese('英語學習軟件與代碼', 'simplified');
check('繁→简', t2s === '英语学习软件与代码', t2s);
const protectedMd = convertChinese('---\ntitle: 汉语\n---\n\n`代码` 与 $数学$ 与 [链接文字](https://example.com/中文路径)', 'traditional');
check(
  'front matter / 代码 / 数学 / URL 不转换（链接文字正常转换）',
  protectedMd.includes('`代码`') &&
    protectedMd.includes('$数学$') &&
    protectedMd.includes('https://example.com/中文路径') &&
    protectedMd.includes('title: 汉语') &&
    protectedMd.includes('[鏈接文字]'),
  protectedMd,
);

if (failed > 0) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log('\n单元断言全部通过');
