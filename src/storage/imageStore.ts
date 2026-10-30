/**
 * 图片插入（EX-02）：相册/文件选图 → 复制到笔记同目录 assets/ → 返回相对路径引用
 */
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { joinUri, parentDir } from './workspaceRepo';

function sanitizeImageName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/[^-\w.\u4e00-\u9fff]/g, '')
    .replace(/^-+|-+$/g, '');
}

async function uniqueName(dir: string, base: string): Promise<string> {
  let name = base;
  let counter = 1;
  while ((await FileSystem.getInfoAsync(joinUri(dir, name))).exists) {
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    name = `${stem}-${counter}${ext}`;
    counter += 1;
  }
  return name;
}

/** 扩展名 → MIME */
export function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

/**
 * 打开相册选择图片，复制到笔记同目录 assets/ 下，返回待插入的 Markdown 引用。
 * 用户取消返回 null。
 */
export async function pickImage(notePath: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets && result.assets[0];
  if (!asset || !asset.uri) return null;

  const noteDir = parentDir(notePath);
  const assetsDir = joinUri(noteDir, 'assets');
  const info = await FileSystem.getInfoAsync(assetsDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(assetsDir, { intermediates: true });
  }
  const rawName = asset.fileName ?? 'image.png';
  const dot = rawName.lastIndexOf('.');
  const ext = dot > 0 ? rawName.slice(dot).toLowerCase() : '.jpg';
  const stem = dot > 0 ? rawName.slice(0, dot) : rawName;
  const base = `${sanitizeImageName(stem) || 'image'}${ext}`;
  const name = await uniqueName(assetsDir, base);
  const target = joinUri(assetsDir, name);
  await FileSystem.copyAsync({ from: asset.uri, to: target });
  return `![${sanitizeImageName(stem) || '图片'}](assets/${name})`;
}

/** 解析笔记相对路径图片 → data URI（预览 requestImages 桥接） */
export async function readImageAsDataUri(
  notePath: string,
  rel: string,
): Promise<string | null> {
  try {
    const noteDir = parentDir(notePath);
    const decoded = decodeURIComponent(rel);
    const abs = /^[a-z]+:\/\//i.test(decoded)
      ? decoded
      : joinUri(noteDir, decoded.replace(/^\.\//, ''));
    const info = await FileSystem.getInfoAsync(abs);
    if (!info.exists || info.isDirectory) return null;
    const b64 = await FileSystem.readAsStringAsync(abs, { encoding: 'base64' });
    return `data:${mimeFromPath(abs)};base64,${b64}`;
  } catch {
    return null;
  }
}
