/**
 * 本地版本快照（EX-07）：
 * - 每次自动保存前，若磁盘旧内容相对最近一次快照有变化，将其快照至 history/
 * - 每篇笔记保留最近 20 份，超量滚动删除
 * - 同一笔记 60 秒内最多快照一次，避免连续输入刷爆配额
 */
import * as FileSystem from 'expo-file-system/legacy';
import { baseName, joinUri } from './workspaceRepo';

export interface SnapshotInfo {
  /** 文件名（时间戳） */
  name: string;
  path: string;
  /** 毫秒时间戳 */
  at: number;
}

/** 快照保留份数 */
export const MAX_SNAPSHOTS = 20;
/** 同一笔记快照最小间隔（毫秒） */
const SNAPSHOT_INTERVAL_MS = 60_000;

interface SnapState {
  content: string | null;
  at: number;
}

const snapStates = new Map<string, SnapState>();

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function snapshotName(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.md`
  );
}

/** 工作区 history 目录下的笔记专属快照目录（扁平化相对路径） */
function historyDirFor(root: string, notePath: string): string {
  const rootNo = root.replace(/\/+$/, '');
  const rel = notePath.startsWith(rootNo) ? notePath.slice(rootNo.length + 1) : baseName(notePath);
  const flat = rel.replace(/\//g, '__');
  return joinUri(joinUri(rootNo, 'history'), flat);
}

/** 读取一篇笔记最近的快照（无则 null） */
async function latestSnapshot(dir: string): Promise<SnapshotInfo | null> {
  const items = await listSnapshots(dir);
  return items.length > 0 ? items[0] : null;
}

async function listSnapshots(dir: string): Promise<SnapshotInfo[]> {
  try {
    const names = await FileSystem.readDirectoryAsync(dir);
    const out: SnapshotInfo[] = [];
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.md')) continue;
      const m = /^(\d{8})-(\d{6})\.md$/.exec(name);
      if (!m) continue;
      const dateStr = m[1];
      const timeStr = m[2];
      const at = new Date(
        Number(dateStr.slice(0, 4)),
        Number(dateStr.slice(4, 6)) - 1,
        Number(dateStr.slice(6, 8)),
        Number(timeStr.slice(0, 2)),
        Number(timeStr.slice(2, 4)),
        Number(timeStr.slice(4, 6)),
      ).getTime();
      out.push({ name, path: joinUri(dir, name), at });
    }
    return out.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

/** 列出一篇笔记的全部快照（按时间倒序） */
export async function listNoteSnapshots(root: string, notePath: string): Promise<SnapshotInfo[]> {
  return listSnapshots(historyDirFor(root, notePath));
}

/**
 * 自动保存前调用：把磁盘上的旧内容快照下来。
 * @returns 是否写入了新快照
 */
export async function snapshotIfNeeded(
  root: string,
  notePath: string,
  onDiskContent: string,
): Promise<boolean> {
  if (!onDiskContent) return false;
  const state = snapStates.get(notePath);
  if (state && Date.now() - state.at < SNAPSHOT_INTERVAL_MS) {
    // 限流窗口内：跳过（旧内容仅与上次快照差一点点）
    return false;
  }
  const dir = historyDirFor(root, notePath);
  let lastContent: string | null = state?.content ?? null;
  if (lastContent === null) {
    const latest = await latestSnapshot(dir);
    if (latest) {
      try {
        lastContent = await FileSystem.readAsStringAsync(latest.path);
      } catch {
        lastContent = null;
      }
    }
  }
  if (lastContent === onDiskContent) {
    snapStates.set(notePath, { content: lastContent, at: state?.at ?? Date.now() });
    return false;
  }
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const name = snapshotName(new Date());
    await FileSystem.writeAsStringAsync(joinUri(dir, name), onDiskContent);
    snapStates.set(notePath, { content: onDiskContent, at: Date.now() });
  } catch {
    return false;
  }
  // 超量滚动删除
  const items = await listSnapshots(dir);
  if (items.length > MAX_SNAPSHOTS) {
    for (const old of items.slice(MAX_SNAPSHOTS)) {
      try {
        await FileSystem.deleteAsync(old.path, { idempotent: true });
      } catch {
        // 忽略
      }
    }
  }
  return true;
}

/** 读取快照内容 */
export async function readSnapshot(path: string): Promise<string> {
  return FileSystem.readAsStringAsync(path);
}

/** 删除单个快照 */
export async function deleteSnapshot(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true });
}

/** 快照状态随笔记重命名迁移（内存中即可：旧 key 失效后自动重建） */
export function forgetSnapshotState(notePath: string): void {
  snapStates.delete(notePath);
}
