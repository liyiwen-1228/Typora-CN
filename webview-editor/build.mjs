/**
 * 构建脚本：
 *  1. 把 CodeMirror 6 编辑器打包成单文件 HTML → ../assets/editor.html
 *     （Metro 通过 assetExts 把 .html 当静态资源，RN 侧用 expo-asset 加载进 WebView）
 *  2. KaTeX CSS 及其 woff2 字体全部以 data URI 内联，保证预览/导出离线可用
 *  3. 快捷键录制器打包成独立小页面 → ../assets/recorder.html（EX-08）
 *
 * 运行：node build.mjs（根目录 npm run build:editor 会自动调用）
 * 说明：esbuild 经 CLI 子进程调用（stdio inherit），避免 JS API 的管道通信。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const jsMarker = '/* __EDITOR_JS__ */';
const katexMarker = '/* __KATEX_CSS__ */';
const outPath = join(root, '..', 'assets', 'editor.html');
const recorderOutPath = join(root, '..', 'assets', 'recorder.html');
const distDir = join(root, 'dist');

const esbuildBin = join(root, 'node_modules', '.bin', 'esbuild');

/** 用 esbuild CLI 打包（dist/editor.js + dist/editor.css + dist/recorder.js） */
function runEsbuild() {
  const common = [
    '--bundle',
    '--minify',
    '--format=iife',
    '--target=es2020',
    '--platform=browser',
    '--legal-comments=none',
    `--outdir=${distDir}`,
  ];
  const r = spawnSync(
    esbuildBin,
    [join('src', 'main.ts'), `--entry-names=editor`, ...common],
    { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' },
  );
  if (r.status !== 0) throw new Error(`esbuild 打包编辑器失败（exit ${r.status}）`);
  const r2 = spawnSync(
    esbuildBin,
    [join('src', 'recorder.ts'), '--entry-names=recorder', ...common],
    { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' },
  );
  if (r2.status !== 0) throw new Error(`esbuild 打包录制器失败（exit ${r2.status}）`);
}

/** 把 KaTeX CSS 的字体引用替换为 base64 data URI（仅保留 woff2，iOS Safari 原生支持） */
function inlineKatexFonts(css) {
  const fontsDir = join(root, 'node_modules', 'katex', 'dist', 'fonts');
  let out = css;
  // 去掉 woff / ttf 的备用 src 条目（保留首个 woff2 条目）
  out = out.replace(/,\s*url\(fonts\/[^)]+?\.woff\) format\("woff"\)/g, '');
  out = out.replace(/,\s*url\(fonts\/[^)]+?\.ttf\) format\("truetype"\)/g, '');
  // woff2 全部内联
  out = out.replace(/url\(fonts\/([^)]+?\.woff2)\)/g, (_, name) => {
    const file = join(fontsDir, name);
    if (!existsSync(file)) return `url(fonts/${name})`;
    const data = readFileSync(file).toString('base64');
    return `url(data:font/woff2;base64,${data})`;
  });
  return out;
}
rmSync(distDir, { recursive: true, force: true });
runEsbuild();

const jsPath = join(distDir, 'editor.js');
const recPath = join(distDir, 'recorder.js');
if (!existsSync(jsPath)) throw new Error('未生成编辑器 JS 产物');
if (!existsSync(recPath)) throw new Error('未生成录制器 JS 产物');

const js = readFileSync(jsPath, 'utf8');
const css = inlineKatexFonts(readFileSync(join(root, 'node_modules', 'katex', 'dist', 'katex.min.css'), 'utf8'));
const recJs = readFileSync(recPath, 'utf8');

/** 防止内联脚本里的 </script> 提前终止 <script> 标签 */
const jsSafe = js.replace(/<\/script>/gi, '<\\/script>');
const recJsSafe = recJs.replace(/<\/script>/gi, '<\\/script>');

const template = readFileSync(join(root, 'template.html'), 'utf8');
if (!template.includes(jsMarker)) {
  throw new Error(`template.html 中缺少占位符 ${jsMarker}`);
}
if (!template.includes(katexMarker)) {
  throw new Error(`template.html 中缺少占位符 ${katexMarker}`);
}

const katexCss = inlineKatexFonts(css);
const html = template
  .replace(jsMarker, () => jsSafe)
  .replace(katexMarker, () => katexCss);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(
  `[build:editor] 已生成 ${outPath}（内联 JS ${(jsSafe.length / 1024).toFixed(1)} KB，KaTeX CSS ${(katexCss.length / 1024).toFixed(1)} KB）`,
);

const recHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>Shortcut Recorder</title>
<style>
html, body { margin: 0; height: 100%; background: transparent; }
#hint { color: #8a8d96; font: 14px -apple-system, 'PingFang SC', sans-serif; display: flex; height: 100%; align-items: center; justify-content: center; text-align: center; padding: 12px; }
</style>
</head>
<body>
<div id="hint">请按下新的快捷键组合（需含 Mod 键）<br/>Esc 取消</div>
<script>${recJsSafe}</script>
</body>
</html>
`;
writeFileSync(recorderOutPath, recHtml);
console.log(`[build:editor] 已生成 ${recorderOutPath}（内联 JS ${(recJsSafe.length / 1024).toFixed(1)} KB）`);
