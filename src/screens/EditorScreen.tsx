import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EditorToolbar from '../components/EditorToolbar';
import EditorWebView, { type EditorWebViewHandle } from '../components/EditorWebView';
import type { WvChangeEvent } from '../bridge/protocol';
import { readNote, writeNote } from '../storage/notesRepo';
import { useTheme } from '../theme/ThemeContext';

// 放宽图标 name 的类型为 string，避免对具体图标键名的编译期依赖
const MCI = MaterialCommunityIcons as unknown as React.ComponentType<{
  name: string;
  size?: number;
  color?: string;
}>;

const AUTO_SAVE_DELAY_MS = 800;
const TITLE_RE = /^#\s+(.+)$/m;

interface EditorScreenProps {
  /** 笔记文件路径 */
  path: string;
  onBack: () => void;
}

interface EditorStats {
  cursorLine: number;
  totalLines: number;
  charCount: number;
  wordCount: number;
}

export default function EditorScreen({ path, onBack }: EditorScreenProps) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [stats, setStats] = useState<EditorStats>({
    cursorLine: 1,
    totalLines: 1,
    charCount: 0,
    wordCount: 0,
  });
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const webviewRef = useRef<EditorWebViewHandle>(null);
  /** 文件可能因“按标题自动重命名”而变化，以 ref 跟踪当前路径 */
  const pathRef = useRef(path);
  const contentRef = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初次加载笔记
  useEffect(() => {
    let alive = true;
    readNote(path)
      .then((text) => {
        if (!alive) return;
        contentRef.current = text;
        setContent(text);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  // 立即保存（返回最终路径）
  const saveNow = useCallback(async () => {
    try {
      pathRef.current = await writeNote(pathRef.current, contentRef.current);
    } catch {
      // 保存失败时保持现状，等待下一次自动保存
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void saveNow();
    }, AUTO_SAVE_DELAY_MS);
  }, [saveNow]);

  // 卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // 键盘弹出/收起跟踪：弹出时收起工具栏的底部安全区留白，避免工具栏与键盘之间出现空隙
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleChange = useCallback(
    (e: WvChangeEvent) => {
      contentRef.current = e.content;
      setContent(e.content);
      setStats({
        cursorLine: e.cursorLine,
        totalLines: e.totalLines,
        charCount: e.charCount,
        wordCount: e.wordCount,
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleSave = useCallback(
    (text: string) => {
      contentRef.current = text;
      setContent(text);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void saveNow();
    },
    [saveNow],
  );

  const handleBack = useCallback(() => {
    // 返回前把未落盘的修改立即保存
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void saveNow();
    onBack();
  }, [onBack, saveNow]);

  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next: 'edit' | 'preview' = m === 'edit' ? 'preview' : 'edit';
      webviewRef.current?.setMode(next);
      return next;
    });
  }, []);

  const handleAction = useCallback((action: Parameters<EditorWebViewHandle['exec']>[0]) => {
    webviewRef.current?.exec(action);
  }, []);

  const title = useMemo(() => {
    const m = TITLE_RE.exec(content);
    return m ? m[1].trim() : '未命名';
  }, [content]);

  const colors = useMemo(
    () => ({
      bg: isDark ? '#1e1f24' : '#ffffff',
      bar: isDark ? '#232429' : '#ffffff',
      fg: isDark ? '#e8eaef' : '#1f2329',
      muted: isDark ? '#8b8e99' : '#8a8d96',
      border: isDark ? '#33353c' : '#e6e7eb',
      accent: isDark ? '#5b8def' : '#2f6fed',
    }),
    [isDark],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* 顶部栏 */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.bar,
            borderBottomColor: colors.border,
            paddingTop: insets.top + 6,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={handleBack} hitSlop={8} style={styles.backBtn}>
            <MCI name="chevron-left" size={26} color={colors.accent} />
          </Pressable>
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: colors.fg }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.stats, { color: colors.muted }]} numberOfLines={1}>
              {mode === 'preview'
                ? '预览模式'
                : `${stats.cursorLine}/${stats.totalLines} 行 · ${stats.wordCount} 字 · ${stats.charCount} 字符`}
            </Text>
          </View>
          <Pressable onPress={toggleMode} hitSlop={8} style={styles.modeBtn}>
            <MCI
              name={mode === 'preview' ? 'pencil-outline' : 'eye-outline'}
              size={22}
              color={colors.accent}
            />
          </Pressable>
        </View>
      </View>

      {/* 编辑器 WebView */}
      <View style={styles.editorWrap}>
        <EditorWebView
          ref={webviewRef}
          content={content}
          dark={isDark}
          onChange={handleChange}
          onSave={handleSave}
        />
      </View>

      {/* 格式化工具栏（预览模式下禁用） */}
      <View
        style={{
          paddingBottom: keyboardVisible ? 4 : Math.max(insets.bottom, 4),
          backgroundColor: colors.bar,
        }}
      >
        <EditorToolbar onAction={handleAction} disabled={mode === 'preview'} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
    paddingHorizontal: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    padding: 4,
  },
  titleWrap: {
    flex: 1,
    marginHorizontal: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  stats: {
    fontSize: 11,
    marginTop: 1,
  },
  modeBtn: {
    padding: 6,
  },
  editorWrap: {
    flex: 1,
  },
});
