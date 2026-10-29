import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme_mode';

interface ThemeContextValue {
  /** 用户设置的模式（system 表示跟随系统） */
  mode: ThemeMode;
  /** 实际是否为深色（system 模式下跟随系统当前值） */
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  /** system → light → dark → system 循环切换 */
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // 启动时恢复上次的选择
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => {
        // 读取失败保持默认
      });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // 忽略持久化失败
    });
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode =
        prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
        // 忽略持久化失败
      });
      return next;
    });
  }, []);

  const isDark = mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

  const value = useMemo(
    () => ({ mode, isDark, setMode, cycleMode }),
    [mode, isDark, setMode, cycleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme 必须在 ThemeProvider 内使用');
  }
  return ctx;
}
