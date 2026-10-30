/**
 * 命令面板（EX-05）：⌘⇧P 呼出，模糊搜索全部命令（格式化/跳转/导出/切主题）
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

export interface PaletteItem {
  id: string;
  label: string;
  /** 所属分组（展示用） */
  group: string;
  run: () => void;
}

interface CommandPaletteProps {
  visible: boolean;
  items: PaletteItem[];
  onClose: () => void;
}

/** 模糊匹配：连续子序列命中（中文按原样，英文大小写不敏感） */
function fuzzyMatch(label: string, query: string): boolean {
  if (!query) return true;
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (l.includes(q)) return true;
  let i = 0;
  for (const ch of l) {
    if (ch === q[i]) i += 1;
    if (i >= q.length) return true;
  }
  return i >= q.length;
}

export default function CommandPalette({ visible, items, onClose }: CommandPaletteProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const listRef = useRef<FlatList<PaletteItem>>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;
    return items.filter((it) => fuzzyMatch(it.label, q));
  }, [items, query]);

  if (!visible) return null;

  const close = () => {
    setQuery('');
    Keyboard.dismiss();
    onClose();
  };

  const runItem = (item: PaletteItem) => {
    close();
    // 先收起面板再执行，避免状态竞争
    setTimeout(() => item.run(), 0);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <View
          style={[
            styles.panel,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginTop: insets.top + 48,
            },
          ]}
        >
          <TextInput
            style={[styles.input, { color: colors.fg, borderColor: colors.border }]}
            placeholder="输入命令名…"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
            selectTextOnFocus={false}
          />
          <FlatList
            ref={listRef}
            data={filtered}
            keyExtractor={(it) => it.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.item,
                  { backgroundColor: pressed ? colors.blockBg : 'transparent' },
                ]}
                onPress={() => runItem(item)}
              >
                <Text style={[styles.itemLabel, { color: colors.fg }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={[styles.itemGroup, { color: colors.muted }]}>{item.group}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.muted }]}>没有匹配的命令</Text>
            }
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 16,
  },
  panel: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '62%',
    overflow: 'hidden',
  },
  input: {
    height: 44,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  list: {
    flexGrow: 0,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  itemLabel: {
    fontSize: 15,
  },
  itemGroup: {
    fontSize: 12,
    marginLeft: 12,
  },
  empty: {
    textAlign: 'center',
    padding: 18,
    fontSize: 14,
  },
});
