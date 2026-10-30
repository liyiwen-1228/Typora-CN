import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { SettingsProvider } from './settings/SettingsContext';
import DocumentsScreen from './screens/DocumentsScreen';
import EditorScreen from './screens/EditorScreen';
import SettingsScreen from './screens/SettingsScreen';
import WorkspaceScreen from './screens/WorkspaceScreen';
import {
  createNote,
  defaultWorkspace,
  getActiveWorkspace,
  getActiveWorkspaceId,
  type WorkspaceInfo,
} from './storage/workspaceRepo';
import { SAMPLE_NOTE_CONTENT } from './storage/sampleNote';

/** 轻量页面栈（不引入导航库） */
type Screen =
  | { name: 'list' }
  | { name: 'editor'; path: string }
  | { name: 'settings' }
  | { name: 'workspaces' };

const FIRST_LAUNCH_KEY = 'first_launch_done_v1';

function AppInner() {
  const { isDark } = useTheme();
  const [stack, setStack] = useState<Screen[]>([{ name: 'list' }]);
  const [workspace, setWorkspace] = useState<WorkspaceInfo>(defaultWorkspace());
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [autoFocusSearch, setAutoFocusSearch] = useState(false);

  // 恢复活动工作区（WS-01：完全杀掉 App 重启后仍停留在所选工作区）
  useEffect(() => {
    void (async () => {
      const ws = await getActiveWorkspace();
      setWorkspace(ws);
    })();
  }, []);

  /** 首次启动引导（XT-04）：创建示例笔记 */
  useEffect(() => {
    void (async () => {
      try {
        const done = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
        if (done) return;
        await AsyncStorage.setItem(FIRST_LAUNCH_KEY, '1');
        const ws = await getActiveWorkspace();
        const listing = await FileSystem.readDirectoryAsync(
          ws.root.replace(/\/+$/, ''),
        ).catch(() => [] as string[]);
        if (!listing.some((name) => name.toLowerCase().endsWith('.md'))) {
          const note = await createNote(ws.root);
          await FileSystem.writeAsStringAsync(note.path, SAMPLE_NOTE_CONTENT);
        }
      } catch {
        // 引导失败不影响使用
      }
    })();
  }, []);

  // 外部「文件」App 打开 .md（WS-04：需独立安装包才生效，Expo Go 内无法验证）
  useEffect(() => {
    const tryOpen = (url: string | null | undefined) => {
      if (!url || !/\.md(\?.*)?$/i.test(url.split('#')[0])) return;
      setStack([{ name: 'list' }, { name: 'editor', path: url }]);
    };
    Linking.getInitialURL()
      .then(tryOpen)
      .catch(() => undefined);
    const sub = Linking.addEventListener('url', (e) => tryOpen(e.url));
    return () => sub.remove();
  }, []);

  const push = useCallback((screen: Screen) => {
    setStack((prev) => [...prev, screen]);
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  /** 打开另一篇笔记（替换栈顶，避免栈无限加深） */
  const openEditor = useCallback((path: string) => {
    setStack((prev) => {
      const next = prev.slice(0, -1);
      next.push({ name: 'editor', path });
      return next;
    });
  }, []);

  const handleWorkspaceChanged = useCallback(async () => {
    const ws = await getActiveWorkspace();
    setWorkspace(ws);
    setWorkspaceVersion((v) => v + 1);
    setStack((prev) => (prev[prev.length - 1].name === 'workspaces' ? prev.slice(0, -1) : prev));
  }, []);

  const top = stack[stack.length - 1];

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {top.name === 'list' ? (
        <DocumentsScreen
          workspace={workspace}
          workspaceVersion={workspaceVersion}
          autoFocusSearch={autoFocusSearch}
          onAutoFocusConsumed={() => setAutoFocusSearch(false)}
          onOpenNote={(path) => push({ name: 'editor', path })}
          onOpenSettings={() => push({ name: 'settings' })}
          onOpenWorkspaces={() => push({ name: 'workspaces' })}
        />
      ) : top.name === 'editor' ? (
        <EditorScreen
          key={top.path}
          path={top.path}
          root={workspace.root}
          onBack={pop}
          onOpenPath={openEditor}
          onNewNote={async (dir) => {
            try {
              const note = await createNote(workspace.root, dir);
              openEditor(note.path);
            } catch {
              // 新建失败留在当前页
            }
          }}
          onGlobalSearch={() => {
            setAutoFocusSearch(true);
            setStack([{ name: 'list' }]);
          }}
        />
      ) : top.name === 'settings' ? (
        <SettingsScreen onBack={pop} />
      ) : (
        <WorkspaceScreen onBack={pop} onChanged={handleWorkspaceChanged} />
      )}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SettingsProvider>
          <AppInner />
        </SettingsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
