/**
 * 工作区与笔记存储（WS-01/02/03 + FE-04/06/07）
 *
 * - 工作区：iOS「文件」App 中可选任意目录（document-picker getDirectoryAsync），
 *   未选择时维持应用沙盒 documents/notes/
 * - 文件操作：递归列出、新建笔记/文件夹、重命名、删除、跨文件夹移动
 * - 全文搜索（FE-06）与 front matter 元数据（FE-04）
 */
import * as DocumentPicker from 'expo-document-picker';
// 注意：Expo SDK 54（expo-file-system 19.x）起，经典 API 需从 expo-file-system/legacy 导入
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { displayTitle, parseFrontMatter } from './frontMatter';

export interface NoteMeta {
  fileName: string;
  /** 绝对路径（URI 形式） */
  path: string;
  /** 相对工作区根（含文件名） */
  relPath: string;
  /** 相对目录（'' = 根） */
  dir: string;
  title: string;
  excerpt: string;
  tags: string[];
  /** front matter date 字段（FE-04） */
  fmDate?: string;
  modifiedAt: number;
  charCount: number;
  size: number;
}

export interface DirMeta {
  name: string;
  /** 相对路径 */
  relPath: string;
  /** 直接子笔记数 */
  noteCount: number;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  /** 工作区根目录 URI */
  root: string;
  isDefault?: boolean;
}

/** 默认工作区：应用沙盒 documents/notes/（infoPlist 已开 UIFileSharingEnabled） */
export const NOTES_DIR = `${FileSystem.documentDirectory}notes/`;

const WORKSPACES_KEY = 'workspaces_v1';
const ACTIVE_KEY = 'active_workspace_v1';

const TITLE_RE = /^#\s+(.+)$/m;
const INVALID_FILE_CHARS = /[\\/:*?"<>|]/g;
/** 浏览与搜索时跳过的保留目录 */
const RESERVED_DIRS = new Set(['history', 'assets', '.trash']);

/* ---------------- 路径工具（URI 字符串操作） ---------------- */

export function joinUri(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`;
}

export function parentDir(path: string): string {
  const idx = path.replace(/\/+$/, '').lastIndexOf('/');
  return idx <= 0 ? path : path.slice(0, idx);
}

export function baseName(path: string): string {
  return path.replace(/\/+$/, '').slice(path.replace(/\/+$/, '').lastIndexOf('/') + 1);
}

function normalizeRoot(root: string): string {
  return root.replace(/\/+$/, '');
}

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

/* ---------------- 元数据构建 ---------------- */

function buildMeta(
  root: string,
  dir: string,
  fileName: string,
  content: string,
  size: number,
  modificationTimeSec: number,
): NoteMeta {
  const { fm, body } = parseFrontMatter(content);
  const h1 = TITLE_RE.exec(body)?.[1];
  const title = displayTitle(fm?.title, h1, fileName);
  let excerpt = '';
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    excerpt = line;
    break;
  }
  const relPath = dir ? `${dir}/${fileName}` : fileName;
  return {
    fileName,
    path: joinUri(dir ? joinUri(normalizeRoot(root), dir) : normalizeRoot(root), fileName),
    relPath,
    dir,
    title,
    excerpt,
    tags: fm?.tags ?? [],
    fmDate: fm?.date,
    modifiedAt: Math.round(modificationTimeSec * 1000),
    charCount: content.length,
    size,
  };
}

/** 读取单篇笔记元信息（按路径） */
export async function getNoteMeta(root: string, path: string): Promise<NoteMeta | null> {
  try {
    const [info, content] = await Promise.all([
      FileSystem.getInfoAsync(path),
      FileSystem.readAsStringAsync(path),
    ]);
    if (!info.exists || info.isDirectory) return null;
    const rootNo = normalizeRoot(root);
    const rel = path.startsWith(rootNo) ? path.slice(rootNo.length + 1) : baseName(path);
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    return buildMeta(
      root,
      dir,
      baseName(path),
      content,
      info.size ?? 0,
      info.modificationTime ?? Date.now() / 1000,
    );
  } catch {
    return null;
  }
}

/* ---------------- 工作区列表（WS-03） ---------------- */

export function defaultWorkspace(): WorkspaceInfo {
  return { id: 'default', name: '我的笔记', root: NOTES_DIR, isDefault: true };
}

export async function loadWorkspaces(): Promise<WorkspaceInfo[]> {
  try {
    const stored = await AsyncStorage.getItem(WORKSPACES_KEY);
    if (stored) {
      const list = JSON.parse(stored) as WorkspaceInfo[];
      if (Array.isArray(list) && list.length > 0) {
        const hasDefault = list.some((w) => w.id === 'default');
        return hasDefault ? list : [defaultWorkspace(), ...list];
      }
    }
  } catch {
    // 解析失败回退默认
  }
  return [defaultWorkspace()];
}

async function saveWorkspacesList(list: WorkspaceInfo[]): Promise<void> {
  await AsyncStorage.setItem(WORKSPACES_KEY, JSON.stringify(list));
}

export async function getActiveWorkspaceId(): Promise<string> {
  const id = await AsyncStorage.getItem(ACTIVE_KEY).catch(() => null);
  if (!id) return 'default';
  const list = await loadWorkspaces();
  return list.some((w) => w.id === id) ? id : 'default';
}

export async function getActiveWorkspace(): Promise<WorkspaceInfo> {
  const id = await getActiveWorkspaceId();
  const list = await loadWorkspaces();
  return list.find((w) => w.id === id) ?? defaultWorkspace();
}

export async function setActiveWorkspace(id: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_KEY, id);
}

/** 探测目录可访问性（iOS 安全作用域失效时引导重选，WS-01 风险缓解） */
export async function probeAccess(root: string): Promise<boolean> {
  try {
    await FileSystem.readDirectoryAsync(root);
    return true;
  } catch {
    return false;
  }
}

/** 添加工作区：经系统文件夹选择器选定目录；不可访问时报错（WS-01） */
export async function addWorkspace(): Promise<WorkspaceInfo | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
  if (result.canceled) return null;
  const asset = result.assets && result.assets[0];
  if (!asset || !asset.uri) return null;
  // iOS 目录选择返回的 URI 可能带安全作用域标记，去掉 file:///. 之外的转义
  const uri = decodeURIComponent(asset.uri);
  const ok = await probeAccess(uri);
  if (!ok) {
    throw new Error('无法访问所选目录（iOS 安全作用域限制）。请从「文件」App 中重新选择，或改用默认工作区。');
  }
  const name = baseName(uri) || '新工作区';
  const list = await loadWorkspaces();
  if (list.some((w) => normalizeRoot(w.root) === normalizeRoot(uri))) {
    throw new Error('该目录已经是工作区');
  }
  const ws: WorkspaceInfo = {
    id: `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    root: uri,
  };
  list.push(ws);
  await saveWorkspacesList(list);
  return ws;
}

export async function removeWorkspace(id: string): Promise<WorkspaceInfo[]> {
  const list = (await loadWorkspaces()).filter((w) => !(w.id === id && !w.isDefault));
  await saveWorkspacesList(list);
  // 若移除的是当前工作区 → 回到默认
  const activeId = await getActiveWorkspaceId();
  if (!list.some((w) => w.id === activeId)) {
    await setActiveWorkspace('default');
  }
  return list;
}

/* ---------------- 递归列出（WS-02 / FE-07） ---------------- */

export interface WorkspaceListing {
  notes: NoteMeta[];
  dirs: DirMeta[];
}

/** 递归列出工作区内全部笔记与文件夹（跳过 history/assets 等保留目录） */
export async function listWorkspace(root: string): Promise<WorkspaceListing> {
  const notes: NoteMeta[] = [];
  const dirs: DirMeta[] = [];
  const rootNo = normalizeRoot(root);

  const walk = async (dir: string, relDir: string): Promise<number> => {
    let names: string[];
    try {
      names = await FileSystem.readDirectoryAsync(dir);
    } catch {
      return 0;
    }
    let noteCount = 0;
    for (const name of names.sort()) {
      if (name.startsWith('.')) continue;
      const full = joinUri(dir, name);
      const rel = relDir ? `${relDir}/${name}` : name;
      let info: Awaited<ReturnType<typeof FileSystem.getInfoAsync>>;
      try {
        info = await FileSystem.getInfoAsync(full);
      } catch {
        continue;
      }
      if (!info.exists) continue;
      if (info.isDirectory) {
        if (RESERVED_DIRS.has(name.toLowerCase())) continue;
        const count = await walk(full, rel);
        dirs.push({ name, relPath: rel, noteCount: count });
        noteCount += count;
      } else if (name.toLowerCase().endsWith('.md')) {
        try {
          const content = await FileSystem.readAsStringAsync(full);
          notes.push(
            buildMeta(root, relDir, name, content, info.size ?? 0, info.modificationTime ?? Date.now() / 1000),
          );
          noteCount += 1;
        } catch {
          // 跳过无法读取的文件
        }
      }
    }
    return noteCount;
  };

  await walk(rootNo, '');
  return {
    notes: notes.sort((a, b) => b.modifiedAt - a.modifiedAt),
    dirs,
  };
}

export async function listNotes(root: string): Promise<NoteMeta[]> {
  return (await listWorkspace(root)).notes;
}

/** 确保目录存在 */
export async function ensureDir(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  }
}

/* ---------------- 笔记读写 ---------------- */

export async function readNote(path: string): Promise<string> {
  return FileSystem.readAsStringAsync(path);
}

export async function readNoteSafe(path: string): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return null;
    return await FileSystem.readAsStringAsync(path);
  } catch {
    return null;
  }
}

/** 写入笔记内容；若标题（front matter title > 首个 h1）与当前文件名不同则自动按标题重命名
 *  （目标名冲突时保留原文件名）。返回最终文件路径。 */
export async function writeNote(path: string, content: string): Promise<string> {
  await ensureDir(parentDir(path));
  await FileSystem.writeAsStringAsync(path, content);
  const { fm, body } = parseFrontMatter(content);
  const h1 = TITLE_RE.exec(body)?.[1];
  const desired = displayTitle(fm?.title, h1, baseName(path));
  const desiredName = `${sanitizeFileName(desired)}.md`;
  const currentName = baseName(path);
  if (!desiredName || desiredName === currentName) return path;
  const dir = parentDir(path);
  const desiredPath = joinUri(dir, desiredName);
  const info = await FileSystem.getInfoAsync(desiredPath);
  if (info.exists) return path;
  await FileSystem.copyAsync({ from: path, to: desiredPath });
  await FileSystem.deleteAsync(path, { idempotent: true });
  return desiredPath;
}

/** 在指定子目录新建笔记并返回元信息 */
export async function createNote(root: string, dir = ''): Promise<NoteMeta> {
  const targetDir = dir ? joinUri(normalizeRoot(root), dir) : normalizeRoot(root);
  await ensureDir(targetDir);
  const fileName = `未命名-${timeStamp()}.md`;
  const path = joinUri(targetDir, fileName);
  const content = '# 未命名\n\n';
  await FileSystem.writeAsStringAsync(path, content);
  return buildMeta(root, dir, fileName, content, content.length, Date.now() / 1000);
}

/** 新建文件夹（WS-02） */
export async function createFolder(root: string, parentDirRel = '', name: string): Promise<string> {
  const clean = sanitizeFileName(name.replace(/\.md$/i, ''));
  const target = joinUri(
    parentDirRel ? joinUri(normalizeRoot(root), parentDirRel) : normalizeRoot(root),
    clean,
  );
  await ensureDir(target);
  return target;
}

/** 按新标题重命名笔记文件，返回新路径 */
export async function renameNote(path: string, newTitle: string): Promise<string> {
  const clean = newTitle.trim();
  if (!clean) throw new Error('标题不能为空');
  const newName = `${sanitizeFileName(clean)}.md`;
  const dir = parentDir(path);
  const newPath = joinUri(dir, newName);
  if (newPath === path) return path;
  const info = await FileSystem.getInfoAsync(newPath);
  if (info.exists) throw new Error('已存在同名笔记');
  await FileSystem.copyAsync({ from: path, to: newPath });
  await FileSystem.deleteAsync(path, { idempotent: true });
  return newPath;
}

/** 重命名文件夹 */
export async function renameFolder(root: string, dirRelPath: string, newName: string): Promise<string> {
  const clean = sanitizeFileName(newName);
  if (!clean || clean === '.') throw new Error('名称不能为空');
  const rootNo = normalizeRoot(root);
  const oldPath = joinUri(rootNo, dirRelPath);
  const parent = parentDir(oldPath);
  const newPath = joinUri(parent, clean);
  if (newPath === oldPath) return oldPath;
  const info = await FileSystem.getInfoAsync(newPath);
  if (info.exists) throw new Error('已存在同名文件夹');
  await FileSystem.moveAsync({ from: oldPath, to: newPath });
  return newPath;
}

/** 删除文件或文件夹（递归） */
export async function deleteEntry(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true });
}

/** 移动文件/文件夹到目标目录（WS-02） */
export async function moveEntry(path: string, targetDir: string): Promise<string> {
  const name = baseName(path);
  let target = joinUri(targetDir, name);
  // 目标重名时追加序号
  let counter = 1;
  while ((await FileSystem.getInfoAsync(target)).exists) {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    target = joinUri(targetDir, `${stem}-${counter}${ext}`);
    counter += 1;
  }
  try {
    await FileSystem.moveAsync({ from: path, to: target });
  } catch {
    // 部分盘符（安全作用域目录）move 受限时退化为复制+删除
    await FileSystem.copyAsync({ from: path, to: target });
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
  return target;
}

/** 通过系统文件选择器导入 Markdown 文件到当前目录 */
export async function importNote(root: string, dir = ''): Promise<NoteMeta | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/*', 'text/markdown', 'public.plain-text'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets && result.assets[0];
  if (!asset) return null;
  const targetDir = dir ? joinUri(normalizeRoot(root), dir) : normalizeRoot(root);
  await ensureDir(targetDir);
  const base = asset.name ? asset.name.replace(/\.md$/i, '') : `导入-${timeStamp()}`;
  let fileName = `${sanitizeFileName(base)}.md`;
  let target = joinUri(targetDir, fileName);
  let counter = 1;
  while ((await FileSystem.getInfoAsync(target)).exists) {
    fileName = `${sanitizeFileName(base)}-${counter}.md`;
    target = joinUri(targetDir, fileName);
    counter += 1;
  }
  await FileSystem.copyAsync({ from: asset.uri, to: target });
  const content = await FileSystem.readAsStringAsync(target);
  const info = (await FileSystem.getInfoAsync(target)) as {
    exists: boolean;
    size?: number;
    modificationTime?: number;
  };
  return buildMeta(
    root,
    dir,
    fileName,
    content,
    info.size ?? content.length,
    info.modificationTime ?? Date.now() / 1000,
  );
}

/* ---------------- 全文搜索（FE-06） ---------------- */

export interface SearchHit {
  note: NoteMeta;
  /** 命中行片段 */
  lines: string[];
}

/** 全文搜索：标题/tags/正文命中均返回，正文返回命中行片段（高亮片段由 UI 处理） */
export async function searchNotes(root: string, query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const { notes } = await listWorkspace(root);
  const hits: SearchHit[] = [];
  for (const note of notes) {
    const lines: string[] = [];
    if (note.title.toLowerCase().includes(q) || note.tags.some((t) => t.toLowerCase().includes(q))) {
      lines.push(note.excerpt || note.title);
    }
    if (note.excerpt.toLowerCase().includes(q) && !lines.includes(note.excerpt)) {
      lines.push(note.excerpt);
    }
    try {
      const content = await FileSystem.readAsStringAsync(note.path);
      for (const raw of content.split('\n')) {
        if (lines.length >= 3) break;
        if (raw.toLowerCase().includes(q)) {
          const trimmed = raw.trim();
          const snippet = trimmed.length > 64 ? `${trimmed.slice(0, 30)}…${trimmed.slice(-28)}` : trimmed;
          if (!lines.includes(snippet)) lines.push(snippet);
        }
      }
    } catch {
      // 跳过读取失败的文件
    }
    if (lines.length > 0) hits.push({ note, lines });
  }
  return hits;
}

/** 按标题查找笔记（Wiki 链接 FE-08：精确匹配优先，其次包含） */
export async function findNoteByTitle(root: string, title: string): Promise<NoteMeta | null> {
  const { notes } = await listWorkspace(root);
  const t = title.trim().toLowerCase();
  return notes.find((n) => n.title.toLowerCase() === t) ?? notes.find((n) => n.title.toLowerCase().includes(t)) ?? null;
}

/** 反向链接：扫描全库引用 [[标题]] 的笔记（FE-08） */
export async function findBacklinks(root: string, title: string): Promise<NoteMeta[]> {
  const t = title.trim();
  if (!t) return [];
  const { notes } = await listWorkspace(root);
  const out: NoteMeta[] = [];
  for (const note of notes) {
    try {
      const content = await FileSystem.readAsStringAsync(note.path);
      if (content.includes(`[[${t}]]`) || content.includes(`[[${t}|`)) {
        out.push(note);
      }
    } catch {
      // 跳过
    }
  }
  return out;
}
