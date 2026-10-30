/**
 * 工作区管理（WS-03）：添加新工作区（系统文件夹选择器）、移除、切换；
 * 显示每个工作区名称与笔记数。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showActionSheet } from '../components/actionSheet';
import {
  addWorkspace,
  getActiveWorkspaceId,
  listWorkspace,
  loadWorkspaces,
  probeAccess,
  removeWorkspace,
  setActiveWorkspace,
  type WorkspaceInfo,
} from '../storage/workspaceRepo';
import { useTheme } from '../theme/ThemeContext';

const MCI = MaterialCommunityIcons as unknown as React.ComponentType<{
  name: string;
  size?: number;
  color?: string;
}>;

interface WorkspaceScreenProps {
  onBack: () => void;
  /** 切换/变更工作区后通知 App 刷新列表页 */
  onChanged: (activeId: string) => void;
}

interface WorkspaceRow extends WorkspaceInfo {
  noteCount: number;
}

export default function WorkspaceScreen({ onBack, onChanged }: WorkspaceScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [activeId, setActiveId] = useState('default');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await loadWorkspaces();
      const id = await getActiveWorkspaceId();
      const counted = await Promise.all(
        list.map(async (ws) => {
          const listing = await listWorkspace(ws.root).catch(() => null);
          return { ...ws, noteCount: listing ? listing.notes.length : 0 };
        }),
      );
      setRows(counted);
      setActiveId(id);
    } catch {
      Alert.alert('错误', '读取工作区列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = useCallback(async () => {
    try {
      const ws = await addWorkspace();
      if (ws) {
        await setActiveWorkspace(ws.id);
        await refresh();
        onChanged(ws.id);
        Alert.alert('已添加', `工作区「${ws.name}」已设为当前工作区`);
      }
    } catch (err) {
      Alert.alert('添加失败', err instanceof Error ? err.message : '未知错误');
    }
  }, [refresh, onChanged]);

  const handleSwitch = useCallback(
    async (id: string) => {
      const ws = rows.find((r) => r.id === id);
      if (!ws) return;
      if (id !== 'default') {
        // 启动/切换前探测访问权限（iOS 安全作用域可能失效，WS-01 风险缓解）
        const ok = await probeAccess(ws.root);
        if (!ok) {
          Alert.alert(
            '无法访问工作区',
            'iOS 安全作用域已失效，请重新选择该目录（仅需一次点击），或切回默认工作区。',
            [
              { text: '取消', style: 'cancel' },
              {
                text: '重新选择',
                onPress: () => {
                  void (async () => {
                    try {
                      await removeWorkspace(id);
                      const added = await addWorkspace();
                      if (added) {
                        await setActiveWorkspace(added.id);
                        await refresh();
                        onChanged(added.id);
                      }
                    } catch (err) {
                      Alert.alert('错误', err instanceof Error ? err.message : '重选失败');
                      await refresh();
                    }
                  })();
                },
              },
            ],
          );
          return;
        }
      }
      await setActiveWorkspace(id);
      setActiveId(id);
      onChanged(id);
    },
    [rows, onChanged, refresh],
  );

  const handleRemove = useCallback(
    (row: WorkspaceRow) => {
      Alert.alert('移除工作区', `从列表中移除「${row.name}」？（不会删除任何文件）`, [
        { text: '取消', style: 'cancel' },
        {
          text: '移除',
          style: 'destructive',
          onPress: async () => {
            await removeWorkspace(row.id);
            const id = await getActiveWorkspaceId();
            await refresh();
            onChanged(id);
          },
        },
      ]);
    },
    [refresh, onChanged],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.bar },
        ]}
      >
        <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
          <MCI name="chevron-left" size={26} color={colors.accent} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.fg }]}>工作区</Text>
        <Pressable onPress={handleAdd} hitSlop={8} style={{ padding: 4 }}>
          <MCI name="plus" size={26} color={colors.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        <Text style={[styles.hint, { color: colors.muted }]}>
          可将 iOS「文件」App 中的任意文件夹（iCloud Drive、「我的 iPhone」等）设为工作目录；未选择时使用应用沙盒目录。添加后长按可移除。
        </Text>
        {loading ? null : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {rows.map((row, i) => (
              <Pressable
                key={row.id}
                style={[
                  styles.row,
                  i < rows.length - 1
                    ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }
                    : null,
                ]}
                onPress={() => void handleSwitch(row.id)}
                onLongPress={() => {
                  if (row.isDefault) return;
                  showActionSheet('工作区操作', row.name, ['取消', '移除'], 1, 0, (idx) => {
                    if (idx === 1) void handleRemove(row);
                  });
                }}
              >
                <MCI
                  name={row.isDefault ? 'home-outline' : 'folder-multiple-outline'}
                  size={20}
                  color={colors.accent}
                />
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: colors.fg }]} numberOfLines={1}>
                    {row.name}
                    {row.id === activeId ? '（当前）' : ''}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.muted }]} numberOfLines={1}>
                    {row.noteCount} 篇笔记 · {row.root.replace(/^file:\/\//, '')}
                  </Text>
                </View>
                {row.id === activeId ? (
                  <MCI name="check-circle" size={20} color={colors.accent} />
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  hint: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowText: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 12, marginTop: 2 },
});
