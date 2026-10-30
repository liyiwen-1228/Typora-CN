import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { EditorAction } from '../bridge/protocol';
import { useTheme } from '../theme/ThemeContext';

// 放宽图标 name 的类型为 string，避免对具体图标键名的编译期依赖
const MCI = MaterialCommunityIcons as unknown as React.ComponentType<{
  name: string;
  size?: number;
  color?: string;
}>;

interface ToolDef {
  action: EditorAction;
  /** MaterialCommunityIcons 图标名 */
  icon?: string;
  /** 文字按钮（如 H1–H6） */
  text?: string;
}

const TOOLS: ToolDef[] = [
  { action: 'heading1', text: 'H1' },
  { action: 'heading2', text: 'H2' },
  { action: 'heading3', text: 'H3' },
  { action: 'heading4', text: 'H4' },
  { action: 'heading5', text: 'H5' },
  { action: 'heading6', text: 'H6' },
  { action: 'bold', icon: 'format-bold' },
  { action: 'italic', icon: 'format-italic' },
  { action: 'strikethrough', icon: 'format-strikethrough' },
  { action: 'inlineCode', icon: 'code-tags' },
  { action: 'link', icon: 'link-variant' },
  { action: 'image', icon: 'image' },
  { action: 'quote', icon: 'format-quote-open' },
  { action: 'bulletList', icon: 'format-list-bulleted' },
  { action: 'orderedList', icon: 'format-list-numbered' },
  { action: 'taskList', icon: 'format-list-checks' },
  { action: 'table', icon: 'table' },
  { action: 'formatTable', icon: 'table-arrow-right' },
  { action: 'codeBlock', icon: 'code-braces' },
  { action: 'hr', icon: 'minus' },
  { action: 'clearFormat', icon: 'format-clear' },
];

interface EditorToolbarProps {
  onAction: (action: EditorAction) => void;
  /** 预览模式下禁用 */
  disabled?: boolean;
}

export default function EditorToolbar({ onAction, disabled }: EditorToolbarProps) {
  const { isDark } = useTheme();
  const fg = isDark ? '#d8dae2' : '#3a3f49';
  const border = isDark ? '#33353c' : '#e6e7eb';
  const bg = isDark ? '#232429' : '#ffffff';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, { borderTopColor: border, backgroundColor: bg }]}
      contentContainerStyle={styles.content}
    >
      {TOOLS.map((tool) => (
        <Pressable
          key={tool.action}
          onPress={() => onAction(tool.action)}
          disabled={disabled}
          hitSlop={4}
          style={({ pressed }) => [
            styles.button,
            { opacity: disabled ? 0.35 : pressed ? 0.55 : 1 },
          ]}
        >
          {tool.icon ? (
            <MCI name={tool.icon} size={22} color={fg} />
          ) : (
            <Text style={[styles.text, { color: fg }]}>{tool.text}</Text>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 6,
    height: 46,
  },
  button: {
    minWidth: 42,
    height: 42,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Menlo',
  },
});
