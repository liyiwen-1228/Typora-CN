import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COMMAND_DEFS,
  comboToDisplay,
  effectiveKeymap,
  normalizeCombo,
  validateCombo,
  type CommandDef,
} from '../commands/registry';
import RecorderWebView from '../components/RecorderWebView';
import { THEMES, useTheme } from '../theme/ThemeContext';
import {
  FONT_OPTIONS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  useSettings,
} from '../settings/SettingsContext';
import type { ThemeName } from '../bridge/protocol';

const MCI = MaterialCommunityIcons as unknown as React.ComponentType<{
  name: string;
  size?: number;
  color?: string;
}>;

interface SettingsScreenProps {
  onBack: () => void;
}

/** 快捷键录制状态 */
interface RecordState {
  def: CommandDef;
  /** 录制到的组合 */
  combo: string | null;
  /** 校验结果 */
  validation: ReturnType<typeof validateCombo> | null;
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const { colors, theme, setTheme } = useTheme();
  const {
    prefs,
    customCss,
    keymap,
    setPrefs,
    setCustomCss,
    setKeyOverride,
    resetKeyOverride,
    resetAllKeymap,
    focusMode,
    typewriterMode,
    setFocusMode,
    setTypewriterMode,
  } = useSettings();
  const insets = useSafeAreaInsets();
  const [cssDraft, setCssDraft] = useState<string | null>(null);
  const [record, setRecord] = useState<RecordState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const effective = useMemo(() => effectiveKeymap(keymap), [keymap]);

  const cssValue = cssDraft ?? customCss;

  const saveCss = useCallback(() => {
    setCustomCss(cssValue);
    if (cssDraft !== null) setCssDraft(null);
  }, [cssValue, setCustomCss]);

  /** 录制结果处理（EX-08：实时冲突检测 + 转移） */
  const handleRecord = useCallback(
    (combo: string, cancel: boolean) => {
      if (cancel || !record) {
        setRecord(null);
        return;
      }
      // 300ms 内显示检测结果（§9.3）
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setRecord((prev) => {
          if (!prev) return null;
          const validation = validateCombo(combo, effective, prev.def.id);
          return { def: prev.def, combo, validation };
        });
      }, 250);
    },
    [record, effective],
  );

  const commitRecord = useCallback(
    (transfer: boolean) => {
      if (!record || !record.combo || !record.validation?.ok) {
        setRecord(null);
        return;
      }
      const norm = normalizeCombo(record.combo);
      if (!norm) {
        setRecord(null);
        return;
      }
      if (transfer && record.validation.conflictWith) {
        // 转移：清除占用该组合的命令快捷键
        for (const [id, key] of Object.entries(effective)) {
          if (key && normalizeCombo(key) === norm && id !== record.def.id) {
            setKeyOverride(id, null);
          }
        }
      }
      setKeyOverride(record.def.id, norm);
      setRecord(null);
    },
    [record, effective, setKeyOverride],
  );

  const groupedList = useMemo(() => {
    const groups: { group: CommandDef['group']; items: CommandDef[] }[] = [
      { group: '全局', items: [] },
      { group: '格式', items: [] },
      { group: '编辑', items: [] },
    ];
    for (const def of COMMAND_DEFS) {
      const g = groups.find((x) => x.group === def.group);
      if (g) g.items.push(def);
    }
    return groups;
  }, []);

  const renderShortcutRow = useCallback(
    (def: CommandDef) => {
      const key = effective[def.id] ?? null;
      const isCustom = Object.prototype.hasOwnProperty.call(keymap, def.id);
      return (
        <View key={def.id} style={[styles.shortcutRow, { borderColor: colors.border }]}>
          <View style={styles.shortcutLabelWrap}>
            <Text style={[styles.shortcutLabel, { color: colors.fg }]}>{def.label}</Text>
            {isCustom ? (
              <Text style={[styles.shortcutCustom, { color: colors.muted }]}>已自定义</Text>
            ) : null}
          </View>
          <View style={styles.shortcutActions}>
            <Pressable
              style={[
                styles.comboBadge,
                { borderColor: key ? colors.border : 'transparent', backgroundColor: colors.blockBg },
              ]}
              onPress={() =>
                setRecord({ def, combo: null, validation: null })
              }
            >
              <Text
                style={[styles.comboText, { color: key ? colors.fg : colors.muted }]}
                numberOfLines={1}
              >
                {key ? comboToDisplay(key) : '无快捷键'}
              </Text>
            </Pressable>
            {key ? (
              <Pressable hitSlop={6} onPress={() => setKeyOverride(def.id, null)}>
                <MCI name="close-circle-outline" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
            {isCustom ? (
              <Pressable hitSlop={6} onPress={() => resetKeyOverride(def.id)}>
                <MCI name="restore" size={18} color={colors.accent} />
              </Pressable>
            ) : null}
          </View>
        </View>
      );
    },
    [colors, effective, keymap, setKeyOverride, resetKeyOverride],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* 顶部栏 */}
      <View
        style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border, backgroundColor: colors.bar }]}
      >
        <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
          <MCI name="chevron-left" size={26} color={colors.accent} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.fg }]}>设置</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >
        {/* 主题（XT-01） */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>主题（编辑器 + 预览 + 界面同步）</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {THEMES.map((option, i) => (
            <Pressable
              key={option.id}
              style={[
                styles.themeRow,
                i < THEMES.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : null,
              ]}
              onPress={() => setTheme(option.id)}
            >
              <Text style={[styles.themeLabel, { color: colors.fg }]}>{option.label}</Text>
              {theme === option.id ? (
                <MCI name="check-circle" size={20} color={colors.accent} />
              ) : (
                <MCI name="circle-outline" size={20} color={colors.muted} />
              )}
            </Pressable>
          ))}
        </View>

        {/* 编辑器设置（XT-02） */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>编辑器</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.prefRow}>
            <Text style={[styles.prefLabel, { color: colors.fg }]}>字号</Text>
            <View style={styles.stepperRow}>
              <Pressable
                style={[styles.stepperBtn, { borderColor: colors.border }]}
                onPress={() =>
                  setPrefs({ fontSize: Math.max(FONT_SIZE_MIN, prefs.fontSize - 1) })
                }
              >
                <MCI name="minus" size={16} color={colors.fg} />
              </Pressable>
              <Text style={[styles.prefValue, { color: colors.fg }]}>{prefs.fontSize}px</Text>
              <Pressable
                style={[styles.stepperBtn, { borderColor: colors.border }]}
                onPress={() =>
                  setPrefs({ fontSize: Math.min(FONT_SIZE_MAX, prefs.fontSize + 1) })
                }
              >
                <MCI name="plus" size={16} color={colors.fg} />
              </Pressable>
            </View>
          </View>
          <View style={[styles.prefRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <Text style={[styles.prefLabel, { color: colors.fg }]}>行高</Text>
            <View style={styles.stepperRow}>
              <Pressable
                style={[styles.stepperBtn, { borderColor: colors.border }]}
                onPress={() =>
                  setPrefs({
                    lineHeight: Math.max(LINE_HEIGHT_MIN, Math.round((prefs.lineHeight - 0.1) * 10) / 10),
                  })
                }
              >
                <MCI name="minus" size={16} color={colors.fg} />
              </Pressable>
              <Text style={[styles.prefValue, { color: colors.fg }]}>{prefs.lineHeight.toFixed(1)}</Text>
              <Pressable
                style={[styles.stepperBtn, { borderColor: colors.border }]}
                onPress={() =>
                  setPrefs({
                    lineHeight: Math.min(LINE_HEIGHT_MAX, Math.round((prefs.lineHeight + 0.1) * 10) / 10),
                  })
                }
              >
                <MCI name="plus" size={16} color={colors.fg} />
              </Pressable>
            </View>
          </View>
          <View style={[styles.prefRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
            <Text style={[styles.prefLabel, { color: colors.fg }]}>编辑字体</Text>
          </View>
          {FONT_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.fontOptionRow,
                { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
              onPress={() => setPrefs({ fontFamily: option.value })}
            >
              <Text style={[styles.prefLabel, { color: colors.fg }]}>{option.label}</Text>
              {prefs.fontFamily === option.value ? (
                <MCI name="check-circle" size={20} color={colors.accent} />
              ) : (
                <MCI name="circle-outline" size={20} color={colors.muted} />
              )}
            </Pressable>
          ))}
        </View>

        {/* 视图模式（EX-06） */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>视图模式</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            style={[styles.prefRow]}
            onPress={() => setFocusMode(!focusMode)}
          >
            <Text style={[styles.prefLabel, { color: colors.fg }]}>聚焦模式（非当前段落变暗）</Text>
            {focusMode ? (
              <MCI name="toggle-switch" size={26} color={colors.accent} />
            ) : (
              <MCI name="toggle-switch-off-outline" size={26} color={colors.muted} />
            )}
          </Pressable>
          <Pressable
            style={[styles.prefRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
            onPress={() => setTypewriterMode(!typewriterMode)}
          >
            <Text style={[styles.prefLabel, { color: colors.fg }]}>打字机模式（光标保持屏幕中部）</Text>
            {typewriterMode ? (
              <MCI name="toggle-switch" size={26} color={colors.accent} />
            ) : (
              <MCI name="toggle-switch-off-outline" size={26} color={colors.muted} />
            )}
          </Pressable>
        </View>

        {/* 自定义 CSS（XT-01） */}
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>自定义 CSS（覆盖编辑器与预览样式）</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[
              styles.cssInput,
              { color: colors.fg, borderColor: colors.border, backgroundColor: colors.blockBg },
            ]}
            value={cssValue}
            onChangeText={setCssDraft}
            placeholder={'/* 例：*/\n#preview p { line-height: 2; }\n.cm-content { font-weight: 500; }'}
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.cssActions}>
            <Pressable
              style={[styles.cssBtn, { borderColor: colors.border }]}
              onPress={() => {
                setCssDraft('');
                setCustomCss('');
              }}
            >
              <Text style={[styles.cssBtnText, { color: colors.muted }]}>恢复默认</Text>
            </Pressable>
            <Pressable
              style={[styles.cssBtnPrimary, { backgroundColor: colors.accent }]}
              onPress={saveCss}
            >
              <Text style={styles.cssBtnPrimaryText}>保存并应用</Text>
            </Pressable>
          </View>
        </View>

        {/* 快捷键（EX-08） */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.muted }]}>快捷键（点击组合键录制新按键）</Text>
          <Pressable hitSlop={6} onPress={() => {
            Alert.alert('恢复默认', '把全部快捷键恢复为默认总表？', [
              { text: '取消', style: 'cancel' },
              { text: '恢复', onPress: () => resetAllKeymap() },
            ]);
          }}>
            <Text style={[styles.resetAll, { color: colors.accent }]}>全部恢复默认</Text>
          </Pressable>
        </View>
        {groupedList.map((group) =>
          group.items.length > 0 ? (
            <View key={group.group}>
              <Text style={[styles.groupTitle, { color: colors.fg }]}>{group.group}</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {group.items.map(renderShortcutRow)}
              </View>
            </View>
          ) : null,
        )}
      </ScrollView>

      {/* 快捷键录制弹层 */}
      <Modal visible={record !== null} transparent animationType="fade" onRequestClose={() => setRecord(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.recordPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.recordTitle, { color: colors.fg }]}>
              为「{record?.def.label}」录制快捷键
            </Text>
            <View style={styles.recordHintWrap}>
              <RecorderWebView onRecord={handleRecord} />
            </View>
            {record?.combo ? (
              <View style={styles.recordResult}>
                <Text style={[styles.recordCombo, { color: colors.fg }]}>
                  {comboToDisplay(record.combo)}
                </Text>
                {record.validation?.ok ? (
                  <Text style={[styles.recordValid, { color: '#2da44e' }]}>✓ 可用</Text>
                ) : (
                  <Text style={[styles.recordInvalid, { color: colors.danger }]}>
                    ✗ {record.validation?.reason}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={[styles.recordWaiting, { color: colors.muted }]}>
                请按下新的组合键（需含 ⌘/Win）· Esc 取消
              </Text>
            )}
            <View style={styles.recordActions}>
              <Pressable
                style={[styles.cssBtn, { borderColor: colors.border }]}
                onPress={() => setRecord(null)}
              >
                <Text style={[styles.cssBtnText, { color: colors.muted }]}>取消</Text>
              </Pressable>
              {record?.validation?.ok && record.combo ? (
                <Pressable
                  style={[styles.cssBtnPrimary, { backgroundColor: colors.accent }]}
                  onPress={() => commitRecord(false)}
                >
                  <Text style={styles.cssBtnPrimaryText}>保存</Text>
                </Pressable>
              ) : null}
              {record?.validation?.kind === 'conflict' && record.combo ? (
                <Pressable
                  style={[styles.cssBtnPrimary, { backgroundColor: colors.danger }]}
                  onPress={() => commitRecord(true)}
                >
                  <Text style={styles.cssBtnPrimaryText}>
                    转移（清除「{record.validation.conflictWith}」的快捷键）
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
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
  body: { flex: 1 },
  bodyContent: { padding: 16 },
  sectionTitle: { fontSize: 13, marginBottom: 8 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  themeLabel: { fontSize: 15 },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  prefLabel: { fontSize: 15, flex: 1 },
  prefValue: { fontSize: 15, fontWeight: '600', marginHorizontal: 12 },
  stepperRow: { flexDirection: 'row', alignItems: 'center' },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cssInput: {
    minHeight: 120,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    fontFamily: 'Menlo',
    fontSize: 12,
    textAlign: 'left',
  },
  cssActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 10,
  },
  cssBtn: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cssBtnText: { fontSize: 14 },
  cssBtnPrimary: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cssBtnPrimaryText: { fontSize: 14, color: '#ffffff', fontWeight: '600' },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shortcutLabelWrap: { flex: 1, marginRight: 10 },
  shortcutLabel: { fontSize: 15 },
  shortcutCustom: { fontSize: 11, marginTop: 1 },
  shortcutActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  comboBadge: {
    minWidth: 68,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  comboText: { fontSize: 13, fontFamily: 'Menlo' },
  resetAll: { fontSize: 13 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  recordPanel: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  recordTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  recordHintWrap: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  recordResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  recordCombo: { fontSize: 18, fontFamily: 'Menlo', fontWeight: '700' },
  recordValid: { fontSize: 14, fontWeight: '600' },
  recordInvalid: { fontSize: 13, flex: 1 },
  recordWaiting: { fontSize: 13, marginTop: 12, textAlign: 'center' },
  recordActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
});
