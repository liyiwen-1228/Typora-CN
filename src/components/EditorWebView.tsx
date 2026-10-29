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
  WvChangeEvent,
  WvEvent,
} from '../bridge/protocol';

/** 暴露给父组件的控制接口 */
export interface EditorWebViewHandle {
  /** 执行一个格式化动作 */
  exec: (action: EditorAction) => void;
  /** 切换 编辑/预览 模式 */
  setMode: (mode: 'edit' | 'preview') => void;
  /** 切换深浅色主题 */
  setTheme: (dark: boolean) => void;
}

interface EditorWebViewProps {
  /** 初始（或外部更新）内容。用户输入引起的回声不会触发重新加载 */
  content: string;
  dark: boolean;
  onReady?: () => void;
  onChange?: (e: WvChangeEvent) => void;
  onSave?: (content: string) => void;
}

/**
 * 承载 CodeMirror 6 编辑器的 WebView 容器。
 * - 通过 expo-asset 加载打包为静态资源的 assets/editor.html
 * - WebView 就绪前缓存所有 RN 命令，收到 ready 事件后统一补发
 */
const EditorWebView = forwardRef<EditorWebViewHandle, EditorWebViewProps>(
  function EditorWebView({ content, dark, onReady, onChange, onSave }, ref) {
    const [assets] = useAssets([require('../../assets/editor.html')]);
    const webviewRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const pendingRef = useRef<RnCommand[]>([]);
    /** 最近一次编辑器上报的内容，用于区分“回声”与“外部内容更新” */
    const lastReportedRef = useRef('');
    const contentRef = useRef(content);
    const darkRef = useRef(dark);
    const onChangeRef = useRef(onChange);
    const onReadyRef = useRef(onReady);
    const onSaveRef = useRef(onSave);

    onChangeRef.current = onChange;
    onReadyRef.current = onReady;
    onSaveRef.current = onSave;

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
        setTheme: (isDark) => postCommand({ type: 'theme', dark: isDark }),
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
          // 就绪后：先同步主题，再加载内容，最后补发排队的命令
          webviewRef.current?.postMessage(
            JSON.stringify({ type: 'theme', dark: darkRef.current } as RnCommand),
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
      }
    }, []);

    // 外部内容变化（且不是编辑器上报的回声）时推送给 WebView
    useEffect(() => {
      contentRef.current = content;
      if (readyRef.current && content !== lastReportedRef.current) {
        postCommand({ type: 'load', content });
      }
    }, [content, postCommand]);

    // 主题变化时通知 WebView 切换深浅色
    useEffect(() => {
      darkRef.current = dark;
      postCommand({ type: 'theme', dark });
    }, [dark, postCommand]);

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
