import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import EditorToolbar from '../components/EditorToolbar';
import EditorWebView, { type EditorWebViewHandle } from '../components/EditorWebView';
import OutlinePanel from '../components/OutlinePanel';
import CommandPalette, { type PaletteItem } from '../components/CommandPalette';
import { showActionSheet } from '../components/actionSheet';
import type {
  EditorAction,
  HeadingInfo,
  WvChangeEvent,
  WvExportResultEvent,
  WvGlobalCommand,
} from '../bridge/protocol';
import { COMMAND_DEFS } from '../commands/registry';
import { parseFrontMatter } from '../storage/frontMatter';
import {
  getNoteMeta,
  readNote,
  readNoteSafe,
  writeNote,
  findNoteByTitle,
  findBacklinks,
  type NoteMeta,
} from '../storage/workspaceRepo';
import {
  listNoteSnapshots,
  readSnapshot,
  snapshotIfNeeded,
  type SnapshotInfo,
} from '../storage/historyRepo';
import { pickImage, readImageAsDataUri } from '../storage/imageStore';
import { convertChinese } from '../convert/opencc';
import { useTheme } from '../theme/ThemeContext';
import { useSettings } from '../settings/SettingsContext';

const MCI = MaterialCommunityIcons as unknown as React.ComponentType<{
  name: string;
  size?: number;
  color?: string;
}>;

const AUTO_SAVE_DELAY_MS = 800;

interface EditorScreenProps {
  /** 笔记文件路径 */
  path: string;
  /** 当前工作区根目录 */
  root: string;
  onBack: () => void;
  /** 打开另一篇笔记（Wiki 链接/反链） */
  onOpenPath: (path: string) => void;
  /** 新建笔记（在指定目录） */
  onNewNote: (dir: string) => void;
  /** 返回列表并聚焦搜索 */
  onGlobalSearch: () => void;
}

interface EditorStats {
  cursorLine: number;
  totalLines: number;
  charCount: number;
  wordCount: number;
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : '未命名';
}

export default function EditorScreen({
  path,
  root,
  onBack,
  onOpenPath,
  onNewNote,
  onGlobalSearch,
}: EditorScreenProps) {
  const { colors, isDark, theme } = useTheme();
  const {
    prefs,
    customCss,
    effectiveKeys,
    focusMode,
    typewriterMode,
    setFocusMode,
    setTypewriterMode,
  } = useSettings();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [stats, setStats] = useState<EditorStats>({
    cursorLine: 1,
    totalLines: 1,
    charCount: 0,
    wordCount: 0,
  });
  const [headings, setHeadings] = useState<HeadingInfo[]>([]);
  const [meta, setMeta] = useState<NoteMeta | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [outlineVisible, setOutlineVisible] = useState(false);
  const [paletteVisible, setPaletteVisible] = useState(false);
  const [backlinks, setBacklinks] = useState<NoteMeta[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);

  const webviewRef = useRef<EditorWebViewHandle>(null);
  /** 文件可能因“按标题自动重命名”而变化，以 ref 跟踪当前路径 */
  const pathRef = useRef(path);
  const contentRef = useRef('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<'edit' | 'preview'>('edit');
  const savedRef = useRef(true);

  // 初次加载笔记
  useEffect(() => {
    let alive = true;
    pathRef.current = path;
    savedRef.current = true;
    Promise.all([readNote(path).catch(() => ''), getNoteMeta(root, path)])
      .then(([text, noteMeta]) => {
        if (!alive) return;
        contentRef.current = text;
        savedRef.current = true;
        setContent(text);
        setMeta(noteMeta);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, root]);

  // 立即保存（保存前快照旧版本，EX-07）
  const saveNow = useCallback(async () => {
    try {
      const current = pathRef.current;
      if (!savedRef.current) {
        const onDisk = await readNoteSafe(current);
        if (onDisk !== null && onDisk !== contentRef.current) {
          await snapshotIfNeeded(root, current, onDisk);
        }
        const finalPath = await writeNote(current, contentRef.current);
        pathRef.current = finalPath;
        savedRef.current = true;
        setMeta(await getNoteMeta(root, finalPath));
      }
    } catch {
      // 保存失败时保持现状，等待下一次自动保存
    }
  }, [root]);

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

  /** 当前笔记显示标题（front matter title > 首个 h1 > 文件名） */
  const currentTitle = useCallback((): string => {
    const { fm, body } = parseFrontMatter(contentRef.current);
    const h1 = /^#\s+(.+)$/m.exec(body)?.[1];
    if (fm?.title) return fm.title;
    if (h1) return h1.trim();
    return pathRef.current.slice(pathRef.current.lastIndexOf('/') + 1).replace(/\.md$/i, '');
  }, []);

  /** 当前笔记相对工作区根的目录（'' = 根目录） */
  const currentDir = useCallback((): string => {
    const path = pathRef.current;
    const rootNo = root.replace(/\/+$/, '');
    if (path.startsWith(rootNo)) {
      const rel = path.slice(rootNo.length + 1);
      const idx = rel.lastIndexOf('/');
      return idx > 0 ? rel.slice(0, idx) : '';
    }
    return '';
  }, [root]);

  // 键盘弹出/收起跟踪
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // 大纲/反链/快照数据加载
  useEffect(() => {
    if (!outlineVisible) return;
    let alive = true;
    const title = currentTitle();
    void (async () => {
      const [links, snaps] = await Promise.all([
        findBacklinks(root, title).catch(() => [] as NoteMeta[]),
        listNoteSnapshots(root, pathRef.current).catch(() => [] as SnapshotInfo[]),
      ]);
      if (!alive) return;
      setBacklinks(links);
      setSnapshots(snaps);
    })();
    return () => {
      alive = false;
    };
  }, [outlineVisible, root, content]);

  const handleChange = useCallback(
    (e: WvChangeEvent) => {
      contentRef.current = e.content;
      savedRef.current = false;
      setContent(e.content);
      setStats({
        cursorLine: e.cursorLine,
        totalLines: e.totalLines,
        charCount: e.charCount,
        wordCount: e.wordCount,
      });
      setHeadings(e.headings);
      scheduleSave();
    },
    [scheduleSave],
  );

  const handleSave = useCallback(
    (text: string) => {
      contentRef.current = text;
      savedRef.current = false;
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
    const next: 'edit' | 'preview' = modeRef.current === 'edit' ? 'preview' : 'edit';
    modeRef.current = next;
    setMode(next);
    webviewRef.current?.setMode(next);
  }, []);

  /** 从相册选图插入（EX-02） */
  const insertFromGallery = useCallback(async () => {
    try {
      const md = await pickImage(pathRef.current);
      if (md) webviewRef.current?.insert(md);
    } catch {
      Alert.alert('错误', '插入图片失败');
    }
  }, []);

  const handleAction = useCallback(
    (action: EditorAction) => {
      if (action === 'image') {
        void insertFromGallery();
        return;
      }
      webviewRef.current?.exec(action);
    },
    [insertFromGallery],
  );

  /** WebView 层全局命令（快捷键捕获，§9.4） */
  const handleGlobalCommand = useCallback(
    (command: WvGlobalCommand) => {
      switch (command) {
        case 'newNote': {
          void (async () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            await saveNow();
            onNewNote(currentDir());
          })();
          break;
        }
        case 'globalSearch':
          void saveNow();
          onGlobalSearch();
          break;
        case 'palette':
          setPaletteVisible(true);
          break;
        case 'outline':
          setOutlineVisible(true);
          break;
        case 'toggleMode':
          toggleMode();
          break;
        case 'image':
          void insertFromGallery();
          break;
      }
    },
    [onNewNote, onGlobalSearch, toggleMode, insertFromGallery, saveNow],
  );

  /** Wiki 链接点击（FE-08） */
  const handleOpenNote = useCallback(
    (title: string) => {
      void (async () => {
        try {
          const target = await findNoteByTitle(root, title);
          if (!target) {
            Alert.alert('未找到笔记', `没有找到标题为「${title}」的笔记`);
            return;
          }
          await saveNow();
          onOpenPath(target.path);
        } catch {
          Alert.alert('错误', '打开链接笔记失败');
        }
      })();
    },
    [root, onOpenPath, saveNow],
  );

  /** 预览/导出时解析相对路径图片 */
  const handleImagesRequested = useCallback((paths: string[]) => {
    void (async () => {
      const map: Record<string, string> = {};
      for (const rel of paths) {
        const uri = await readImageAsDataUri(pathRef.current, rel);
        if (uri) map[rel] = uri;
      }
      webviewRef.current?.postImages(map);
    })();
  }, []);

  /** 导出结果落盘并分享（OT-01/02/03） */
  const handleExportResult = useCallback(
    async (e: WvExportResultEvent) => {
      if (e.error || !e.html) {
        Alert.alert('错误', `导出失败${e.error ? `：${e.error}` : ''}`);
        return;
      }
      try {
        const base = sanitizeFileName(currentTitle());
        if (e.kind === 'html') {
          const file = `${FileSystem.cacheDirectory}${base}.html`;
          await FileSystem.writeAsStringAsync(file, e.html, { encoding: 'utf8' });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(file, { mimeType: 'text/html', dialogTitle: '导出 HTML' });
          } else {
            Alert.alert('提示', '当前设备不支持系统分享面板');
          }
        } else {
          const { uri } = await Print.printToFileAsync({ html: e.html });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              UTI: 'com.adobe.pdf',
              dialogTitle: '导出 PDF',
            });
          } else {
            Alert.alert('提示', `PDF 已生成：${uri}`);
          }
        }
      } catch {
        Alert.alert('错误', '导出失败');
      }
    },
    [],
  );

  const shareMd = useCallback(async () => {
    try {
      await saveNow();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pathRef.current, {
          mimeType: 'text/markdown',
          dialogTitle: '分享 Markdown',
        });
      }
    } catch {
      Alert.alert('错误', '分享失败');
    }
  }, [saveNow]);

  /** 简繁转换（XT-03）：代码块/front matter/URL 不受影响，经 WebView 加载管道生效 */
  const applyConvert = useCallback(
    (variant: 'simplified' | 'traditional') => {
      try {
        const converted = convertChinese(contentRef.current, variant);
        if (converted !== contentRef.current) {
          contentRef.current = converted;
          savedRef.current = false;
          setContent(converted);
          webviewRef.current?.postCommand({ type: 'load', content: converted });
          scheduleSave();
        }
      } catch {
        Alert.alert('错误', '转换失败');
      }
    },
    [scheduleSave],
  );

  /** 恢复历史版本（EX-07） */
  const restoreSnapshot = useCallback(
    (snap: SnapshotInfo) => {
      void (async () => {
        try {
          const onDisk = await readNoteSafe(pathRef.current);
          if (onDisk !== null) {
            await snapshotIfNeeded(root, pathRef.current, onDisk);
          }
          const text = await readSnapshot(snap.path);
          contentRef.current = text;
          savedRef.current = false;
          setContent(text);
          webviewRef.current?.postCommand({ type: 'load', content: text });
          scheduleSave();
        } catch {
          Alert.alert('错误', '恢复失败');
        }
      })();
    },
    [root, scheduleSave],
  );

  const showMoreMenu = useCallback(() => {
    showActionSheet(
      '更多操作',
      currentTitle(),
      ['取消', '分享 Markdown', '导出 HTML', '导出 PDF', '转为繁体', '转为简体', '历史版本'],
      0,
      0,
      (idx) => {
        switch (idx) {
          case 1:
            void shareMd();
            break;
          case 2:
            webviewRef.current?.exportHtml('html', false);
            break;
          case 3:
            // PDF 深色主题导出为浅色打印版（OT-03）
            webviewRef.current?.exportHtml('pdf', true);
            break;
          case 4:
            applyConvert('traditional');
            break;
          case 5:
            applyConvert('simplified');
            break;
          case 6:
            setOutlineVisible(true);
            break;
        }
      },
    );
  }, [shareMd, applyConvert, currentTitle]);

  /** 命令面板条目（EX-05）：全部命令 + 界面操作 */
  const paletteItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = COMMAND_DEFS.map((def) => ({
      id: def.id,
      label: def.label,
      group: def.group,
      run: () => {
        if (def.id === 'image') {
          void insertFromGallery();
        } else if (def.scope === 'webview') {
          webviewRef.current?.exec(def.id as EditorAction);
        } else {
          switch (def.id) {
            case 'newNote':
              void (async () => {
                await saveNow();
                onNewNote(currentDir());
              })();
              break;
            case 'globalSearch':
              onGlobalSearch();
              break;
            case 'outline':
              setOutlineVisible(true);
              break;
            case 'toggleMode':
              toggleMode();
              break;
            default:
              break;
          }
        }
      },
    }));
    items.push(
      { id: 'act-share-md', label: '分享 Markdown', group: '文件', run: () => void shareMd() },
      { id: 'act-export-html', label: '导出 HTML', group: '文件', run: () => webviewRef.current?.exportHtml('html', false) },
      { id: 'act-export-pdf', label: '导出 PDF', group: '文件', run: () => webviewRef.current?.exportHtml('pdf', true) },
      { id: 'act-traditional', label: '转为繁体', group: '中文', run: () => applyConvert('traditional') },
      { id: 'act-simplified', label: '转为简体', group: '中文', run: () => applyConvert('simplified') },
      {
        id: 'act-focus',
        label: `聚焦模式：${focusMode ? '关闭' : '开启'}`,
        group: '视图',
        run: () => setFocusMode(!focusMode),
      },
      {
        id: 'act-typewriter',
        label: `打字机模式：${typewriterMode ? '关闭' : '开启'}`,
        group: '视图',
        run: () => setTypewriterMode(!typewriterMode),
      },
      { id: 'act-snapshots', label: '历史版本', group: '文件', run: () => setOutlineVisible(true) },
    );
    return items;
  }, [
    insertFromGallery,
    saveNow,
    onNewNote,
    onGlobalSearch,
    toggleMode,
    shareMd,
    applyConvert,
    focusMode,
    typewriterMode,
    setFocusMode,
    setTypewriterMode,
    currentDir,
  ]);

  const headerTitle = useMemo(() => {
    if (meta) return meta.title;
    return currentTitle();
  }, [meta, currentTitle]);

  const tags = meta?.tags ?? [];

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
              {headerTitle}
            </Text>
            <Text style={[styles.stats, { color: colors.muted }]} numberOfLines={1}>
              {mode === 'preview'
                ? '预览模式'
                : `${stats.cursorLine}/${stats.totalLines} 行 · ${stats.wordCount} 字 · ${stats.charCount} 字符`}
            </Text>
          </View>
          <Pressable
            onPress={() => setOutlineVisible(true)}
            hitSlop={8}
            style={styles.modeBtn}
            accessibilityLabel="大纲面板"
          >
            <MCI name="format-list-bulleted" size={22} color={colors.accent} />
          </Pressable>
          <Pressable onPress={toggleMode} hitSlop={8} style={styles.modeBtn}>
            <MCI
              name={mode === 'preview' ? 'pencil-outline' : 'eye-outline'}
              size={22}
              color={colors.accent}
            />
          </Pressable>
          <Pressable onPress={showMoreMenu} hitSlop={8} style={styles.modeBtn}>
            <MCI name="dots-horizontal" size={22} color={colors.accent} />
          </Pressable>
        </View>
        {/* front matter 元信息条（FE-04） */}
        {tags.length > 0 || meta?.fmDate ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagsRow}
            contentContainerStyle={styles.tagsContent}
          >
            {tags.map((tag) => (
              <View
                key={tag}
                style={[styles.tagChip, { backgroundColor: colors.blockBg, borderColor: colors.border }]}
              >
                <Text style={[styles.tagText, { color: colors.accent }]}>#{tag}</Text>
              </View>
            ))}
            {meta?.fmDate ? (
              <View style={[styles.tagChip, { backgroundColor: 'transparent', borderColor: 'transparent' }]}>
                <Text style={[styles.tagText, { color: colors.muted }]}>{meta.fmDate}</Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </View>

      {/* 编辑器 WebView */}
      <View style={styles.editorWrap}>
        <EditorWebView
          ref={webviewRef}
          content={content}
          dark={isDark}
          theme={theme}
          customCss={customCss}
          keymap={effectiveKeys}
          prefs={prefs}
          focusMode={focusMode}
          typewriterMode={typewriterMode}
          onChange={handleChange}
          onSave={handleSave}
          onGlobalCommand={handleGlobalCommand}
          onOpenNote={handleOpenNote}
          onImagesRequested={handleImagesRequested}
          onExportResult={(e) => void handleExportResult(e)}
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

      {/* 大纲/反链/历史 侧栏 */}
      <OutlinePanel
        visible={outlineVisible}
        headings={headings}
        cursorLine={stats.cursorLine}
        backlinks={backlinks}
        snapshots={snapshots}
        onClose={() => setOutlineVisible(false)}
        onJump={(line) => webviewRef.current?.scrollTo(line)}
        onOpenNote={(p) => onOpenPath(p)}
        onRestoreSnapshot={restoreSnapshot}
      />

      {/* 命令面板 */}
      <CommandPalette
        visible={paletteVisible}
        items={paletteItems}
        onClose={() => setPaletteVisible(false)}
      />
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
    paddingBottom: 6,
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
    marginHorizontal: 4,
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
  tagsRow: {
    flexGrow: 0,
  },
  tagsContent: {
    alignItems: 'center',
    paddingBottom: 2,
    paddingLeft: 8,
  },
  tagChip: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
  },
  tagText: {
    fontSize: 11,
  },
  editorWrap: {
    flex: 1,
  },
});
