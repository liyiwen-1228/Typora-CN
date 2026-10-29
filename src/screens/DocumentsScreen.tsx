import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createNote,
  deleteNote,
  importNote,
  listNotes,
  renameNote,
  type NoteMeta,
} from '../storage/notesRepo';
import { useTheme } from '../theme/ThemeContext';

// 放宽图标 name 的类型为 string，避免对具体图标键名的编译期依赖
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

export default function DocumentsScreen({ onOpen }: { onOpen: (path: string) => void }) {
  const { isDark, mode, cycleMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const colors = useMemo(
    () => ({
      bg: isDark ? '#17181c' : '#f2f3f6',
      card: isDark ? '#232429' : '#ffffff',
      fg: isDark ? '#e8eaef' : '#1f2329',
      muted: isDark ? '#8b8e99' : '#8a8d96',
      border: isDark ? '#33353c' : '#e6e7eb',
      accent: isDark ? '#5b8def' : '#2f6fed',
    }),
    [isDark],
  );

  const refresh = useCallback(async () => {
    try {
      const items = await listNotes();
      setNotes(items);
    } catch {
      Alert.alert('错误', '读取笔记列表失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.excerpt.toLowerCase().includes(q),
    );
  }, [notes, query]);

  const handleCreate = useCallback(async () => {
    try {
      const note = await createNote();
      onOpen(note.path);
    } catch {
      Alert.alert('错误', '新建笔记失败');
    }
  }, [onOpen]);

  const handleImport = useCallback(async () => {
    try {
      const note = await importNote();
      if (note) await refresh();
    } catch {
      Alert.alert('错误', '导入失败');
    }
  }, [refresh]);

  const handleRename = useCallback(
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
    (note: NoteMeta) => {
      Alert.alert('删除笔记', `确定删除「${note.title}」吗？此操作不可恢复。`, [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote(note.path);
              await refresh();
            } catch {
              Alert.alert('错误', '删除失败');
            }
          },
        },
      ]);
    },
    [refresh],
  );

  const handleItemLongPress = useCallback(
    (note: NoteMeta) => {
      ActionSheetIOS.options(
        '笔记操作',
        note.title,
        ['取消', '重命名', '删除'],
        2, // destructive：删除
        0, // cancel：取消
        (idx) => {
          if (idx === 1) handleRename(note);
          else if (idx === 2) handleDelete(note);
        },
      );
    },
    [handleRename, handleDelete],
  );

  const renderItem = useCallback(
    ({ item }: { item: NoteMeta }) => (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
        onPress={() => onOpen(item.path)}
        onLongPress={() => handleItemLongPress(item)}
      >
        <Text style={[styles.cardTitle, { color: colors.fg }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.excerpt ? (
          <Text style={[styles.cardExcerpt, { color: colors.muted }]} numberOfLines={1}>
            {item.excerpt}
          </Text>
        ) : null}
        <Text style={[styles.cardMeta, { color: colors.muted }]}>
          {formatDate(item.modifiedAt)} · {formatSize(item.size)} · {item.charCount} 字
        </Text>
      </Pressable>
    ),
    [colors, onOpen, handleItemLongPress],
  );

  const themeIcon =
    mode === 'system' ? 'theme-light-dark' : mode === 'light' ? 'weather-sunny' : 'weather-night';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* 顶部栏 */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={[styles.appTitle, { color: colors.fg }]}>笔记</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={handleImport} hitSlop={8} style={styles.iconBtn}>
              <MCI name="file-import-outline" size={22} color={colors.fg} />
            </Pressable>
            <Pressable onPress={cycleMode} hitSlop={8} style={styles.iconBtn}>
              <MCI name={themeIcon} size={22} color={colors.fg} />
            </Pressable>
            <Pressable onPress={handleCreate} hitSlop={8} style={styles.iconBtn}>
              <MCI name="plus" size={26} color={colors.accent} />
            </Pressable>
          </View>
        </View>
        <TextInput
          style={[
            styles.search,
            { backgroundColor: colors.card, color: colors.fg, borderColor: colors.border },
          ]}
          placeholder="搜索笔记…"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* 笔记列表 */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.path}
        renderItem={renderItem}
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
          loading ? null : (
            <View style={styles.empty}>
              <MCI name="notebook-outline" size={48} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {query ? '没有匹配的笔记' : '暂无笔记，点击右上角 + 新建'}
              </Text>
            </View>
          )
        }
      />
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
  appTitle: {
    fontSize: 30,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    marginLeft: 18,
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
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardExcerpt: {
    fontSize: 14,
    marginTop: 4,
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
});
