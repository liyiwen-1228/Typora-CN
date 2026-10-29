import type { RnCommand, WvEvent } from './protocol';

interface ReactNativeWebViewLike {
  postMessage: (data: string) => void;
}

/** WebView → React Native：发送事件 */
export function postEvent(evt: WvEvent): void {
  const w = window as unknown as {
    ReactNativeWebView?: ReactNativeWebViewLike;
  };
  if (w.ReactNativeWebView) {
    w.ReactNativeWebView.postMessage(JSON.stringify(evt));
  }
}

/** React Native → WebView：注册命令处理（RN 侧 webviewRef.postMessage 到达 window 'message'） */
export function onCommand(handler: (cmd: RnCommand) => void): void {
  window.addEventListener('message', (e) => {
    let cmd: RnCommand;
    try {
      cmd = JSON.parse((e as MessageEvent).data) as RnCommand;
    } catch {
      return; // 非 JSON 消息忽略
    }
    if (cmd && typeof cmd === 'object' && typeof cmd.type === 'string') {
      handler(cmd);
    }
  });
}
