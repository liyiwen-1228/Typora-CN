/**
 * 快捷键录制 WebView（EX-08）：加载 assets/recorder.html，
 * 捕获硬件键盘组合并回传归一化 CM6 组合串。录制可靠（WebView 层 keydown）。
 */
import React, { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAssets } from 'expo-asset';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

interface RecorderWebViewProps {
  /** 录制到组合（combo 为空且 cancel=true 表示按 Esc 取消） */
  onRecord: (combo: string, cancel: boolean) => void;
  /** 主题色：提示文字颜色 */
  hintColor?: string;
}

export default function RecorderWebView({ onRecord, hintColor }: RecorderWebViewProps) {
  const [assets] = useAssets([require('../../assets/recorder.html')]);
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as {
        type: string;
        combo?: string;
        cancel?: boolean;
      };
      if (parsed.type === 'recordKey') {
        onRecordRef.current(parsed.combo ?? '', Boolean(parsed.cancel));
      }
    } catch {
      // 忽略非 JSON 消息
    }
  }, []);

  if (!assets) {
    return <View style={styles.box} />;
  }

  return (
    <View style={styles.box}>
      <WebView
        source={{ uri: assets[0].localUri || assets[0].uri }}
        onMessage={handleMessage}
        javaScriptEnabled
        originWhitelist={['*']}
        style={styles.webview}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        hideKeyboardAccessoryView
        keyboardDisplayRequiresUserAction={false}
        containerStyle={styles.webview}
        webViewOnly
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 88,
    borderRadius: 12,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
