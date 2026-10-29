import * as DocumentPicker from 'expo-document-picker';
// 注意：Expo SDK 54（expo-file-system 19.x）起，经典 API 需从 expo-file-system/legacy 导入
import * as FileSystem from 'expo-file-system/legacy';

export interface NoteMeta {
  fileName: string;
  path: string;
  /** 标题：取自正文第一个一级标题，否则取文件名 */
  title: string;
  /** 摘要：第一段非标题非空行 */
  excerpt: string;
  /** 修改时间（毫秒时间戳） */
  modifiedAt: number;
  charCount: number;
  size: number;
}

/** 笔记存放目录（应用沙盒 documents/notes/）。
 *  infoPlist 已开启 UIFileSharingEnabled，可在 iOS「文件」App 中查看该目录。 */
export const NOTES_DIR = `${FileSystem.documentDirectory}notes/`;

const TITLE_RE = /^#\s+(.+)$/m;
const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function timeStamp(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(INVALID_FILE_CHARS, '_').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : '未命名';
}

function buildMeta(
  fileName: string,
  content: string,
  size: number,
  modificationTimeSec: number,
): NoteMeta {
  const titleMatch = TITLE_RE.exec(content);
  const title = titleMatch ? titleMatch[1].trim() : fileName.replace(/\.md$/i, '');
  let excerpt = '';
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    excerpt = line;
    break;
  }
  return {
    fileName,
    path: `${NOTES_DIR}${fileName}`,
    title,
    excerpt,
    modifiedAt: Math.round(modificationTimeSec * 1000),
    charCount: content.length,
    size,
  };
}

/** 确保笔记目录存在 */
export async function ensureNotesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(NOTES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(NOTES_DIR, { intermediates: true });
  }
}

/** 列出全部笔记，按修改时间倒序 */
export async function listNotes(): Promise<NoteMeta[]> {
  await ensureNotesDir();
  const fileNames = await FileSystem.readDirectoryAsync(NOTES_DIR);
  const metas: NoteMeta[] = [];
  for (const fileName of fileNames) {
    if (!fileName.toLowerCase().endsWith('.md')) continue;
    const path = `${NOTES_DIR}${fileName}`;
    try {
      const [info, content] = await Promise.all([
        FileSystem.getInfoAsync(path),
        FileSystem.readAsStringAsync(path),
      ]);
      if (!info.exists || info.isDirectory) continue;
      metas.push(
        buildMeta(fileName, content, info.size ?? 0, info.modificationTime ?? Date.now() / 1000),
      );
    } catch {
      // 跳过无法读取的文件
    }
  }
  return metas.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** 读取笔记全文 */
export async function readNote(path: string): Promise<string> {
  return FileSystem.readAsStringAsync(path);
}

/** 写入笔记内容；若正文首个一级标题与当前文件名不同则自动按标题重命名
 *  （目标名冲突时保留原文件名）。返回最终文件路径。 */
export async function writeNote(path: string, content: string): Promise<string> {
  await ensureNotesDir();
  await FileSystem.writeAsStringAsync(path, content);
  const match = TITLE_RE.exec(content);
  if (!match) return path;
  const desiredName = `${sanitizeFileName(match[1].trim())}.md`;
  const currentName = path.startsWith(NOTES_DIR) ? path.slice(NOTES_DIR.length) : path;
  if (!desiredName || desiredName === currentName) return path;
  const desiredPath = `${NOTES_DIR}${desiredName}`;
  const info = await FileSystem.getInfoAsync(desiredPath);
  if (info.exists) return path;
  await FileSystem.copyAsync({ from: path, to: desiredPath });
  await FileSystem.deleteAsync(path, { idempotent: true });
  return desiredPath;
}

/** 新建笔记并返回元信息 */
export async function createNote(): Promise<NoteMeta> {
  await ensureNotesDir();
  const fileName = `未命名-${timeStamp()}.md`;
  const path = `${NOTES_DIR}${fileName}`;
  const content = '# 未命名\n\n';
  await FileSystem.writeAsStringAsync(path, content);
  return buildMeta(fileName, content, content.length, Date.now() / 1000);
}

/** 删除笔记 */
export async function deleteNote(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true });
}

/** 按新标题重命名笔记文件，返回新路径 */
export async function renameNote(path: string, newTitle: string): Promise<string> {
  const clean = newTitle.trim();
  if (!clean) throw new Error('标题不能为空');
  const newName = `${sanitizeFileName(clean)}.md`;
  const newPath = `${NOTES_DIR}${newName}`;
  if (newPath === path) return path;
  const info = await FileSystem.getInfoAsync(newPath);
  if (info.exists) throw new Error('已存在同名笔记');
  await FileSystem.copyAsync({ from: path, to: newPath });
  await FileSystem.deleteAsync(path, { idempotent: true });
  return newPath;
}

/** 通过系统文件选择器导入一份 Markdown 文件到笔记目录 */
export async function importNote(): Promise<NoteMeta | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'text/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets && result.assets[0];
  if (!asset) return null;
  await ensureNotesDir();
  const base = asset.name ? asset.name.replace(/\.md$/i, '') : `导入-${timeStamp()}`;
  let fileName = `${sanitizeFileName(base)}.md`;
  let target = `${NOTES_DIR}${fileName}`;
  let counter = 1;
  // 避免覆盖已有文件
  while ((await FileSystem.getInfoAsync(target)).exists) {
    fileName = `${sanitizeFileName(base)}-${counter}.md`;
    target = `${NOTES_DIR}${fileName}`;
    counter += 1;
  }
  await FileSystem.copyAsync({ from: asset.uri, to: target });
  const content = await FileSystem.readAsStringAsync(target);
  const info = await FileSystem.getInfoAsync(target);
  return buildMeta(fileName, content, info.size ?? 0, info.modificationTime ?? Date.now() / 1000);
}
