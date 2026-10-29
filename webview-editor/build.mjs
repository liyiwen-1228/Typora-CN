/**
 * 构建脚本：把 CodeMirror 6 编辑器打包成单文件 HTML，输出到 ../assets/editor.html
 * （Metro 通过 assetExts 把 .html 当静态资源，RN 侧用 expo-asset 加载进 WebView）
 *
 * 运行：node build.mjs（根目录 npm run build:editor 会自动调用）
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const jsMarker = '/* __EDITOR_JS__ */';
const outPath = join(root, '..', 'assets', 'editor.html');

const result = await build({
  entryPoints: [join(root, 'src', 'main.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  write: false,
  legalComments: 'none',
});

// 防止内联脚本里的 </script> 提前终止 <script> 标签
const js = result.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');
const template = readFileSync(join(root, 'template.html'), 'utf8');

if (!template.includes(jsMarker)) {
  throw new Error(`template.html 中缺少占位符 ${jsMarker}`);
}

const html = template.replace(jsMarker, () => js);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);

console.log(`[build:editor] 已生成 ${outPath}（内联 JS ${(js.length / 1024).toFixed(1)} KB）`);
