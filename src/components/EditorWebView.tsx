import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { useAssets } from 'expo-asset';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type {
  EditorAction,
  RnCommand,
  ThemeName,
  WvChangeEvent,
  WvEvent,
  WvExportResultEvent,
  WvGlobalCommand,
  WvOpenNoteEvent,
} from '../bridge/protocol';
import type { EditorPrefs } from '../settings/SettingsContext';

/** 暴露给父组件的控制接口 */
export interface EditorWebViewHandle {
  /** 执行一个格式化动作 */
  exec: (action: EditorAction) => void;
  /** 切换 编辑/预览 模式 */
  setMode: (mode: 'edit' | 'preview') => void;
  /** 在光标处插入文本 */
  insert: (text: string) => void;
  /** 大纲跳转 */
  scrollTo: (line: number) => void;
  /** 请求组装导出 HTML */
  exportHtml: (kind: 'html' | 'pdf', forceLight: boolean) => void;
  /** 回复 requestImages */
  postImages: (map: Record<string, string>) => void;
  /** 发送任意命令 */
  postCommand: (cmd: RnCommand) => void;
}

interface EditorWebViewProps {
  /** 初始（或外部更新）内容。用户输入引起的回声不会触发重新加载 */
  content: string;
  dark: boolean;
  theme: ThemeName;
  customCss: string;
  keymap: Record<string, string>;
  prefs: EditorPrefs;
  focusMode: boolean;
  typewriterMode: boolean;
  onReady?: () => void;
  onChange?: (e: WvChangeEvent) => void;
  onSave?: (content: string) => void;
  onGlobalCommand?: (command: WvGlobalCommand) => void;
  onOpenNote?: (title: string) => void;
  onImagesRequested?: (paths: string[]) => void;
  onExportResult?: (e: WvExportResultEvent) => void;
}

/**
 * 承载 CodeMirror 6 编辑器的 WebView 容器。
 * - 通过 expo-asset 加载打包为静态资源的 assets/editor.html
 * - WebView 就绪前缓存所有 RN 命令，收到 ready 事件后统一补发
 */
const EditorWebView = forwardRef<EditorWebViewHandle, EditorWebViewProps>(
  function EditorWebView(
    {
      content,
      dark,
      theme,
      customCss,
      keymap,
      prefs,
      focusMode,
      typewriterMode,
      onReady,
      onChange,
      onSave,
      onGlobalCommand,
      onOpenNote,
      onImagesRequested,
      onExportResult,
    },
    ref,
  ) {
    const [assets] = useAssets([require('../../assets/editor.html')]);
    const webviewRef = useRef<WebView<unknown>>(null);
    const readyRef = useRef(false);
    const pendingRef = useRef<RnCommand[]>([]);
    /** 最近一次编辑器上报的内容，用于区分“回声”与“外部内容更新” */
    const lastReportedRef = useRef('');
    const contentRef = useRef(content);
    const themeRef = useRef({ dark, theme, customCss });
    const keymapRef = useRef(keymap);
    const prefsRef = useRef(prefs);
    const viewModesRef = useRef({ focusMode, typewriterMode });
    const onChangeRef = useRef(onChange);
    const onReadyRef = useRef(onReady);
    const onSaveRef = useRef(onSave);
    const onGlobalCommandRef = useRef(onGlobalCommand);
    const onOpenNoteRef = useRef(onOpenNote);
    const onImagesRequestedRef = useRef(onImagesRequested);
    const onExportResultRef = useRef(onExportResult);

    onChangeRef.current = onChange;
    onReadyRef.current = onReady;
    onSaveRef.current = onSave;
    onGlobalCommandRef.current = onGlobalCommand;
    onOpenNoteRef.current = onOpenNote;
    onImagesRequestedRef.current = onImagesRequested;
    onExportResultRef.current = onExportResult;

    const postCommand = useCallback((cmd: RnCommand) => {
      if (!readyRef.current || !webviewRef.current) {
        pendingRef.current.push(cmd);
        return;
      }
      webviewRef.current.postMessage(JSON.stringify(cmd));
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        exec: (action) => postCommand({ type: 'exec', action }),
        setMode: (mode) => postCommand({ type: 'mode', mode }),
        insert: (text) => postCommand({ type: 'insert', text }),
        scrollTo: (line) => postCommand({ type: 'scrollTo', line }),
        exportHtml: (kind, forceLight) => postCommand({ type: 'exportHtml', kind, forceLight }),
        postImages: (map) => postCommand({ type: 'images', map }),
        postCommand,
      }),
      [postCommand],
    );

    const handleMessage = useCallback((event: WebViewMessageEvent) => {
      let parsed: WvEvent;
      try {
        parsed = JSON.parse(event.nativeEvent.data) as WvEvent;
      } catch {
        return;
      }
      switch (parsed.type) {
        case 'ready': {
          readyRef.current = true;
          // 就绪后：主题 → 快捷键 → 设置 → 视图模式 → 内容，最后补发排队命令
          const t = themeRef.current;
          webviewRef.current?.postMessage(
            JSON.stringify({
              type: 'theme',
              dark: t.dark,
              theme: t.theme,
              customCss: t.customCss,
            } as RnCommand),
          );
          webviewRef.current?.postMessage(
            JSON.stringify({ type: 'keymap', bindings: keymapRef.current } as RnCommand),
          );
          const p = prefsRef.current;
          webviewRef.current?.postMessage(
            JSON.stringify({
              type: 'settings',
              fontSize: p.fontSize,
              lineHeight: p.lineHeight,
              fontFamily: p.fontFamily,
            } as RnCommand),
          );
          const v = viewModesRef.current;
          webviewRef.current?.postMessage(
            JSON.stringify({
              type: 'viewModes',
              focus: v.focusMode,
              typewriter: v.typewriterMode,
            } as RnCommand),
          );
          webviewRef.current?.postMessage(
            JSON.stringify({ type: 'load', content: contentRef.current } as RnCommand),
          );
          const queued = pendingRef.current;
          pendingRef.current = [];
          for (const cmd of queued) {
            webviewRef.current?.postMessage(JSON.stringify(cmd));
          }
          onReadyRef.current?.();
          break;
        }
        case 'change':
          lastReportedRef.current = parsed.content;
          onChangeRef.current?.(parsed);
          break;
        case 'save':
          lastReportedRef.current = parsed.content;
          onSaveRef.current?.(parsed.content);
          break;
        case 'command':
          onGlobalCommandRef.current?.(parsed.command);
          break;
        case 'openNote':
          onOpenNoteRef.current?.((parsed as WvOpenNoteEvent).title);
          break;
        case 'requestImages':
          onImagesRequestedRef.current?.(parsed.paths);
          break;
        case 'exportResult':
          onExportResultRef.current?.(parsed);
          break;
      }
    }, []);

    // 外部内容变化（且不是编辑器上报的回声）时推送给 WebView
    useEffect(() => {
      contentRef.current = content;
      if (readyRef.current && content !== lastReportedRef.current) {
        postCommand({ type: 'load', content });
      }
    }, [content, postCommand]);

    // 主题/自定义 CSS 变化时通知 WebView
    useEffect(() => {
      const changed = themeRef.current.customCss !== customCss;
      themeRef.current = { dark, theme, customCss };
      postCommand(changed ? { type: 'theme', dark, theme, customCss } : { type: 'theme', dark, theme });
    }, [dark, theme, customCss, postCommand]);

    // 快捷键绑定变化 → 重建 keymap
    useEffect(() => {
      keymapRef.current = keymap;
      postCommand({ type: 'keymap', bindings: keymap });
    }, [keymap, postCommand]);

    // 编辑器设置变化
    useEffect(() => {
      prefsRef.current = prefs;
      postCommand({
        type: 'settings',
        fontSize: prefs.fontSize,
        lineHeight: prefs.lineHeight,
        fontFamily: prefs.fontFamily,
      });
    }, [prefs, postCommand]);

    // 聚焦/打字机模式变化
    useEffect(() => {
      viewModesRef.current = { focusMode, typewriterMode };
      postCommand({ type: 'viewModes', focus: focusMode, typewriter: typewriterMode });
    }, [focusMode, typewriterMode, postCommand]);

    if (!assets) {
      return (
        <View style={styles.loading}>
          <ActivityIndicator size="small" />
        </View>
      );
    }

    return (
      <WebView
        ref={webviewRef}
        source={{ uri: assets[0].localUri || assets[0].uri }}
        onMessage={handleMessage}
        javaScriptEnabled
        originWhitelist={['*']}
        style={styles.webview}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        onShouldStartLoadWithRequest={(request) => {
          // 预览中的外链交给系统浏览器打开，防止 WebView 整页跳转丢失编辑器
          if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
            Linking.openURL(request.url).catch(() => undefined);
            return false;
          }
          return true;
        }}
      />
    );
  },
);

export default EditorWebView;

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
