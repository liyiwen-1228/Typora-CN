import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showActionSheet } from '../components/actionSheet';
import {
  createFolder,
  createNote,
  deleteEntry,
  importNote,
  listWorkspace,
  moveEntry,
  renameFolder,
  renameNote,
  searchNotes,
  type DirMeta,
  type NoteMeta,
  type SearchHit,
  type WorkspaceInfo,
} from '../storage/workspaceRepo';
import { useTheme } from '../theme/ThemeContext';

const MCI = MaterialCommunityIcons as unknown as React.ComponentType<{
  name: string;
  size?: number;
  color?: string;
}>;

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface DocumentsScreenProps {
  workspace: WorkspaceInfo;
  /** 工作区版本号：切换/增删后变化，触发列表刷新 */
  workspaceVersion: number;
  /** 返回列表后自动聚焦搜索框（编辑器 ⌘⇧F 全库搜索） */
  autoFocusSearch: boolean;
  onAutoFocusConsumed: () => void;
  onOpenNote: (path: string) => void;
  onOpenSettings: () => void;
  onOpenWorkspaces: () => void;
}

type Entry =
  | { kind: 'dir'; key: string; dir: DirMeta }
  | { kind: 'note'; key: string; note: NoteMeta };

export default function DocumentsScreen({
  workspace,
  workspaceVersion,
  autoFocusSearch,
  onAutoFocusConsumed,
  onOpenNote,
  onOpenSettings,
  onOpenWorkspaces,
}: DocumentsScreenProps) {
  const { colors, cycleTheme, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [dirs, setDirs] = useState<DirMeta[]>([]);
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [currentDir, setCurrentDir] = useState('');
  const [moveTarget, setMoveTarget] = useState<NoteMeta | null>(null);
  const searchInputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const root = workspace.root;

  const refresh = useCallback(async () => {
    try {
      const listing = await listWorkspace(root);
      setNotes(listing.notes);
      setDirs(listing.dirs);
    } catch {
      Alert.alert('错误', '读取笔记列表失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [root]);

  useEffect(() => {
    void refresh();
  }, [refresh, workspaceVersion]);

  useEffect(() => {
    setCurrentDir('');
    setLoading(true);
    setQuery('');
    setSearchHits(null);
  }, [root, workspaceVersion]);

  // 全文搜索（FE-06）：250ms 防抖
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = query.trim();
    if (!q) {
      setSearchHits(null);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      void searchNotes(root, q)
        .then(setSearchHits)
        .catch(() => setSearchHits([]));
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, root]);

  // 编辑器返回后聚焦搜索框
  useEffect(() => {
    if (autoFocusSearch) {
      searchInputRef.current?.focus();
      onAutoFocusConsumed();
    }
  }, [autoFocusSearch, onAutoFocusConsumed]);

  /** 当前目录条目：子文件夹在前 */
  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const d of dirs) {
      const parent = d.relPath.includes('/') ? d.relPath.slice(0, d.relPath.lastIndexOf('/')) : '';
      if (parent !== currentDir) continue;
      out.push({ kind: 'dir', key: `d:${d.relPath}`, dir: d });
    }
    for (const n of notes) {
      if (n.dir !== currentDir) continue;
      out.push({ kind: 'note', key: `n:${n.path}`, note: n });
    }
    return out;
  }, [dirs, notes, currentDir]);

  const breadcrumb = useMemo(() => {
    if (!currentDir) return null;
    const parts = currentDir.split('/');
    return parts;
  }, [currentDir]);

  const handleCreate = useCallback(() => {
    showActionSheet(
      '新建',
      currentDir || '根目录',
      ['取消', '新建笔记', '新建文件夹', '导入 Markdown'],
      0,
      0,
      (idx) => {
        if (idx === 1) {
          void (async () => {
            try {
              const note = await createNote(root, currentDir);
              onOpenNote(note.path);
            } catch {
              Alert.alert('错误', '新建笔记失败');
            }
          })();
        } else if (idx === 2) {
          Alert.prompt(
            '新建文件夹',
            `在「${currentDir || workspace.name}」下创建`,
            async (text) => {
              const name = (text || '').trim();
              if (!name) return;
              try {
                await createFolder(root, currentDir, name);
                await refresh();
              } catch (err) {
                Alert.alert('错误', err instanceof Error ? err.message : '创建失败');
              }
            },
          );
        } else if (idx === 3) {
          void (async () => {
            try {
              const note = await importNote(root, currentDir);
              if (note) await refresh();
            } catch {
              Alert.alert('错误', '导入失败');
            }
          })();
        }
      },
    );
  }, [currentDir, root, workspace.name, onOpenNote, refresh]);

  const handleRenameNote = useCallback(
    (note: NoteMeta) => {
      Alert.prompt(
        '重命名',
        '输入新的标题（不含扩展名）',
        async (text) => {
          const title = (text || '').trim();
          if (!title) return;
          try {
            await renameNote(note.path, title);
            await refresh();
          } catch (err) {
            Alert.alert('错误', err instanceof Error ? err.message : '重命名失败');
          }
        },
        undefined,
        note.title.replace(/\.md$/i, ''),
      );
    },
    [refresh],
  );

  const handleDelete = useCallback(
    (name: string, path: string, isDir: boolean) => {
      Alert.alert(
        isDir ? '删除文件夹' : '删除笔记',
        isDir
          ? `确定删除文件夹「${name}」及其全部内容吗？此操作不可恢复。`
          : `确定删除「${name}」吗？此操作不可恢复。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '删除',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteEntry(path);
                await refresh();
              } catch {
                Alert.alert('错误', '删除失败');
              }
            },
          },
        ],
      );
    },
    [refresh],
  );

  const handleRenameFolder = useCallback(
    (dir: DirMeta) => {
      Alert.prompt(
        '重命名文件夹',
        `重命名「${dir.name}」`,
        async (text) => {
          const name = (text || '').trim();
          if (!name || name === dir.name) return;
          try {
            await renameFolder(root, dir.relPath, name);
            await refresh();
          } catch (err) {
            Alert.alert('错误', err instanceof Error ? err.message : '重命名失败');
          }
        },
        undefined,
        dir.name,
      );
    },
    [root, refresh],
  );

  const handleNoteLongPress = useCallback(
    (note: NoteMeta) => {
      showActionSheet(
        '笔记操作',
        note.title,
        ['取消', '重命名', '移动到…', '删除'],
        3, // destructive：删除
        0, // cancel：取消
        (idx) => {
          if (idx === 1) handleRenameNote(note);
          else if (idx === 2) setMoveTarget(note);
          else if (idx === 3) handleDelete(note.title, note.path, false);
        },
      );
    },
    [handleRenameNote, handleDelete],
  );

  const handleDirLongPress = useCallback(
    (dir: DirMeta) => {
      showActionSheet(
        '文件夹操作',
        dir.name,
        ['取消', '重命名', '删除'],
        2,
        0,
        (idx) => {
          if (idx === 1) handleRenameFolder(dir);
          else if (idx === 2) handleDelete(dir.name, `${root.replace(/\/+$/, '')}/${dir.relPath}`, true);
        },
      );
    },
    [handleRenameFolder, handleDelete, root],
  );

  const handleMove = useCallback(
    async (targetDirRel: string) => {
      if (!moveTarget) return;
      try {
        const targetDirAbs = targetDirRel
          ? `${root.replace(/\/+$/, '')}/${targetDirRel}`
          : root.replace(/\/+$/, '');
        await moveEntry(moveTarget.path, targetDirAbs);
        setMoveTarget(null);
        await refresh();
      } catch (err) {
        Alert.alert('错误', err instanceof Error ? err.message : '移动失败');
      }
    },
    [moveTarget, root, refresh],
  );

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => {
      if (item.kind === 'dir') {
        return (
          <Pressable
            style={({ pressed }) => [
              styles.card,
              styles.dirCard,
              {
                backgroundColor: colors.blockBg,
                borderColor: colors.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
            onPress={() => setCurrentDir(item.dir.relPath)}
            onLongPress={() => handleDirLongPress(item.dir)}
          >
            <MCI name="folder-outline" size={20} color={colors.accent} />
            <Text style={[styles.dirName, { color: colors.fg }]} numberOfLines={1}>
              {item.dir.name}
            </Text>
            <Text style={[styles.dirCount, { color: colors.muted }]}>{item.dir.noteCount} 篇</Text>
            <MCI name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        );
      }
      const note = item.note;
      return (
        <Pressable
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.72 : 1,
            },
          ]}
          onPress={() => onOpenNote(note.path)}
          onLongPress={() => handleNoteLongPress(note)}
        >
          <Text style={[styles.cardTitle, { color: colors.fg }]} numberOfLines={1}>
            {note.title}
          </Text>
          {note.excerpt ? (
            <Text style={[styles.cardExcerpt, { color: colors.muted }]} numberOfLines={1}>
              {note.excerpt}
            </Text>
          ) : null}
          {note.tags.length > 0 ? (
            <View style={styles.tagsRow}>
              {note.tags.slice(0, 4).map((tag) => (
                <View
                  key={tag}
                  style={[styles.tagChip, { backgroundColor: colors.blockBg, borderColor: colors.border }]}
                >
                  <Text style={[styles.tagText, { color: colors.accent }]} numberOfLines={1}>
                    #{tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={[styles.cardMeta, { color: colors.muted }]}>
            {note.dir ? `${note.dir}/` : ''}
            {formatDate(note.modifiedAt)} · {formatSize(note.size)} · {note.charCount} 字
          </Text>
        </Pressable>
      );
    },
    [colors, onOpenNote, handleNoteLongPress, handleDirLongPress],
  );

  const renderSearchItem = useCallback(
    ({ item }: { item: SearchHit }) => (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
        onPress={() => onOpenNote(item.note.path)}
      >
        <Text style={[styles.cardTitle, { color: colors.fg }]} numberOfLines={1}>
          {item.note.title}
        </Text>
        {item.lines.map((line, i) => (
          <Text key={i} style={[styles.cardExcerpt, { color: colors.muted }]} numberOfLines={1}>
            {line}
          </Text>
        ))}
      </Pressable>
    ),
    [colors, onOpenNote],
  );

  /** 列表数据：搜索时展示全文命中，否则展示当前目录条目 */
  const flatData = useMemo<
    { key: string; kind: 'entry'; entry: Entry }[] | { key: string; kind: 'search'; hit: SearchHit }[]
  >(() => {
    if (searchHits) {
      return searchHits.map((hit) => ({ key: `s:${hit.note.path}`, kind: 'search' as const, hit }));
    }
    return entries.map((entry) => ({ key: entry.key, kind: 'entry' as const, entry }));
  }, [searchHits, entries]);

  const renderFlatItem = useCallback(
    ({
      item,
    }: {
      item:
        | { key: string; kind: 'entry'; entry: Entry }
        | { key: string; kind: 'search'; hit: SearchHit };
    }) =>
      item.kind === 'entry' ? renderItem({ item: item.entry }) : renderSearchItem({ item: item.hit }),
    [renderItem, renderSearchItem],
  );

  const themeIcon =
    theme === 'ink'
      ? 'circle-outline'
      : theme === 'nord'
        ? 'snowflake'
        : theme === 'solarized'
          ? 'weather-sunny-off'
          : theme === 'dracula'
            ? 'ghost'
            : theme === 'github-light'
              ? 'source-branch'
              : 'theme-light-dark';

  const headerTitle = currentDir ? (breadcrumb?.[breadcrumb.length - 1] ?? workspace.name) : workspace.name;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* 顶部栏 */}
      <View
        style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}
      >
        <View style={styles.headerRow}>
          {/* 工作区切换入口（WS-03） */}
          <Pressable
            style={[styles.wsChip, { borderColor: colors.border, backgroundColor: colors.blockBg }]}
            onPress={onOpenWorkspaces}
          >
            <MCI name="folder-multiple-outline" size={15} color={colors.accent} />
            <Text style={[styles.wsChipText, { color: colors.fg }]} numberOfLines={1}>
              {headerTitle}
            </Text>
            <MCI name="chevron-down" size={14} color={colors.muted} />
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable onPress={onOpenSettings} hitSlop={8} style={styles.iconBtn}>
              <MCI name="cog-outline" size={22} color={colors.fg} />
            </Pressable>
            <Pressable onPress={cycleTheme} hitSlop={8} style={styles.iconBtn}>
              <MCI name={themeIcon} size={22} color={colors.fg} />
            </Pressable>
            <Pressable onPress={handleCreate} hitSlop={8} style={styles.iconBtn}>
              <MCI name="plus" size={26} color={colors.accent} />
            </Pressable>
          </View>
        </View>
        {/* 面包屑（FE-07） */}
        {currentDir ? (
          <View style={styles.breadcrumbRow}>
            <Pressable onPress={() => setCurrentDir('')} hitSlop={6}>
              <Text style={[styles.crumb, { color: colors.accent }]}>{workspace.name}</Text>
            </Pressable>
            {(breadcrumb ?? []).map((part, i) => (
              <React.Fragment key={i}>
                <Text style={[styles.crumbSep, { color: colors.muted }]}> › </Text>
                <Pressable
                  onPress={() => setCurrentDir((breadcrumb ?? []).slice(0, i + 1).join('/'))}
                  hitSlop={6}
                >
                  <Text
                    style={[
                      styles.crumb,
                      { color: i === (breadcrumb ?? []).length - 1 ? colors.fg : colors.accent },
                    ]}
                  >
                    {part}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        ) : null}
        <TextInput
          ref={searchInputRef}
          style={[
            styles.search,
            { backgroundColor: colors.card, color: colors.fg, borderColor: colors.border },
          ]}
          placeholder="搜索笔记（标题 / 标签 / 全文）…"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* 列表 */}
      <FlatList
        data={flatData}
        keyExtractor={(item) => item.key}
        renderItem={renderFlatItem}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.muted}
            onRefresh={() => {
              setRefreshing(true);
              void refresh();
            }}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: insets.bottom + 24,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          loading ? undefined : (
            <View style={styles.empty}>
              <MCI name="notebook-outline" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {query
                  ? '没有匹配的笔记'
                  : currentDir
                    ? '空文件夹，点击右上角 + 新建'
                    : '暂无笔记，点击右上角 + 新建'}
              </Text>
            </View>
          )
        }
      />

      {/* 移动到…（WS-02 跨文件夹移动） */}
      <Modal visible={moveTarget !== null} transparent animationType="fade" onRequestClose={() => setMoveTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMoveTarget(null)}>
          <View style={[styles.movePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.moveTitle, { color: colors.fg }]}>
              移动「{moveTarget?.title}」到…
            </Text>
            <FlatList
              data={[{ relPath: '', name: workspace.name }, ...dirs]}
              keyExtractor={(item) => item.relPath || '__root__'}
              style={styles.moveList}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.moveItem, { borderColor: colors.border }]}
                  onPress={() => void handleMove(item.relPath)}
                >
                  <MCI
                    name={item.relPath ? 'folder-outline' : 'home-outline'}
                    size={17}
                    color={colors.accent}
                  />
                  <Text style={[styles.moveItemText, { color: colors.fg }]} numberOfLines={1}>
                    {item.relPath || `${item.name}（根目录）`}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  wsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 210,
  },
  wsChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: 18,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  crumb: {
    fontSize: 13,
  },
  crumbSep: {
    fontSize: 13,
  },
  search: {
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
  },
  dirCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
  },
  dirName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  dirCount: {
    fontSize: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardExcerpt: {
    fontSize: 14,
    marginTop: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagChip: {
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 11,
  },
  cardMeta: {
    fontSize: 12,
    marginTop: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  movePanel: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    maxHeight: '64%',
  },
  moveTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  moveList: {
    flexGrow: 0,
  },
  moveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  moveItemText: {
    fontSize: 14,
    flex: 1,
  },
});
