/**
 * 大纲面板（FE-05）：标题树点击跳转 + 反向链接（FE-08）+ 历史版本（EX-07）
 */
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HeadingInfo } from '../bridge/protocol';
import type { NoteMeta } from '../storage/workspaceRepo';
import type { SnapshotInfo } from '../storage/historyRepo';
import { useTheme } from '../theme/ThemeContext';

const MCI = MaterialCommunityIcons as unknown as React.ComponentType<{
  name: string;
  size?: number;
  color?: string;
}>;

interface OutlinePanelProps {
  visible: boolean;
  headings: HeadingInfo[];
  cursorLine: number;
  backlinks: NoteMeta[];
  snapshots: SnapshotInfo[];
  onClose: () => void;
  onJump: (line: number) => void;
  onOpenNote: (path: string) => void;
  onRestoreSnapshot: (snapshot: SnapshotInfo) => void;
}

function formatSnapTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function OutlinePanel({
  visible,
  headings,
  cursorLine,
  backlinks,
  snapshots,
  onClose,
  onJump,
  onOpenNote,
  onRestoreSnapshot,
}: OutlinePanelProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'outline' | 'backlinks' | 'history'>('outline');

  if (!visible) return null;

  /** 光标所在标题（面板高亮当前节） */
  let activeIdx = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].line <= cursorLine) activeIdx = i;
    else break;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[
            styles.panel,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingTop: insets.top + 10,
              paddingBottom: insets.bottom + 10,
            },
          ]}
        >
          <View style={styles.tabs}>
            {(
              [
                ['outline', '大纲'],
                ['backlinks', `反链 ${backlinks.length}`],
                ['history', `历史 ${snapshots.length}`],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: tab === key ? colors.blockBg : 'transparent',
                    borderColor: tab === key ? colors.border : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.tabText, { color: tab === key ? colors.fg : colors.muted }]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {tab === 'outline' &&
              (headings.length === 0 ? (
                <Text style={[styles.empty, { color: colors.muted }]}>无标题。用 # 创建标题。</Text>
              ) : (
                headings.map((h, i) => (
                  <Pressable
                    key={`${h.line}-${i}`}
                    style={({ pressed }) => [
                      styles.headingRow,
                      { backgroundColor: pressed ? colors.blockBg : 'transparent' },
                    ]}
                    onPress={() => {
                      onJump(h.line);
                      onClose();
                    }}
                  >
                    <View style={[styles.headingBar, { width: 6 * (h.level - 1) }]} />
                    <Text
                      style={[
                        styles.headingText,
                        { color: i === activeIdx ? colors.accent : colors.fg },
                        h.level <= 2 ? styles.headingStrong : null,
                      ]}
                      numberOfLines={2}
                    >
                      {h.text}
                    </Text>
                    <Text style={[styles.headingLine, { color: colors.muted }]}>{h.line}</Text>
                  </Pressable>
                ))
              ))}
            {tab === 'backlinks' &&
              (backlinks.length === 0 ? (
                <Text style={[styles.empty, { color: colors.muted }]}>暂无反向链接</Text>
              ) : (
                backlinks.map((note) => (
                  <Pressable
                    key={note.path}
                    style={({ pressed }) => [
                      styles.backlinkRow,
                      { backgroundColor: pressed ? colors.blockBg : 'transparent' },
                    ]}
                    onPress={() => {
                      onOpenNote(note.path);
                      onClose();
                    }}
                  >
                    <MCI name="link-variant" size={15} color={colors.accent} />
                    <Text style={[styles.backlinkText, { color: colors.fg }]} numberOfLines={1}>
                      {note.title}
                    </Text>
                  </Pressable>
                ))
              ))}
            {tab === 'history' &&
              (snapshots.length === 0 ? (
                <Text style={[styles.empty, { color: colors.muted }]}>暂无历史版本</Text>
              ) : (
                snapshots.map((snap) => (
                  <Pressable
                    key={snap.path}
                    style={({ pressed }) => [
                      styles.backlinkRow,
                      styles.snapRow,
                      { backgroundColor: pressed ? colors.blockBg : 'transparent' },
                    ]}
                    onPress={() => {
                      Alert.alert(
                        '恢复历史版本',
                        `恢复到 ${formatSnapTime(snap.at)} 的版本？当前内容会先自动快照。`,
                        [
                          { text: '取消', style: 'cancel' },
                          {
                            text: '恢复',
                            onPress: () => {
                              onRestoreSnapshot(snap);
                              onClose();
                            },
                          },
                        ],
                      );
                    }}
                  >
                    <MCI name="history" size={15} color={colors.accent} />
                    <Text style={[styles.backlinkText, { color: colors.fg }]}>
                      {formatSnapTime(snap.at)}
                    </Text>
                  </Pressable>
                ))
              ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.30)',
    alignItems: 'flex-end',
  },
  panel: {
    width: '76%',
    maxWidth: 380,
    height: '100%',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 24,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  headingBar: {
    height: 18,
  },
  headingText: {
    flex: 1,
    fontSize: 14,
    marginLeft: 4,
  },
  headingStrong: {
    fontWeight: '600',
  },
  headingLine: {
    fontSize: 11,
    marginLeft: 8,
  },
  backlinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  snapRow: {
    justifyContent: 'flex-start',
    gap: 8,
  },
  backlinkText: {
    fontSize: 14,
    marginLeft: 8,
  },
  empty: {
    textAlign: 'center',
    padding: 22,
    fontSize: 13,
  },
});
