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
import type { ThemeName } from '../bridge/protocol';

export type { ThemeName } from '../bridge/protocol';

/** RN 界面调色板 */
export interface Palette {
  bg: string;
  card: string;
  bar: string;
  fg: string;
  muted: string;
  border: string;
  accent: string;
  danger: string;
  /** 预览/标签底色 */
  blockBg: string;
}

export interface ThemeOption {
  id: ThemeName;
  label: string;
  /** 主题本身是否为深色（default 主题跟随系统） */
  dark: boolean | 'system';
}

/** 一期 XT-01：内置 6 套主题 */
export const THEMES: ThemeOption[] = [
  { id: 'default', label: '默认', dark: 'system' },
  { id: 'ink', label: '墨黑', dark: true },
  { id: 'nord', label: 'Nord', dark: true },
  { id: 'solarized', label: 'Solarized', dark: false },
  { id: 'dracula', label: 'Dracula', dark: true },
  { id: 'github-light', label: 'GitHub Light', dark: false },
];

const PALETTES: Record<ThemeName, { light: Palette; dark?: Palette }> = {
  default: {
    light: {
      bg: '#f2f3f6', card: '#ffffff', bar: '#ffffff', fg: '#1f2329', muted: '#8a8d96',
      border: '#e6e7eb', accent: '#2f6fed', danger: '#d64545', blockBg: '#f8f9fb',
    },
    dark: {
      bg: '#17181c', card: '#232429', bar: '#232429', fg: '#e8eaef', muted: '#8b8e99',
      border: '#33353c', accent: '#5b8def', danger: '#e57171', blockBg: '#23242b',
    },
  },
  ink: {
    light: {
      bg: '#000000', card: '#141414', bar: '#0a0a0a', fg: '#e6e6e6', muted: '#808080',
      border: '#232323', accent: '#6ea8fe', danger: '#e57171', blockBg: '#0d0d0d',
    },
  },
  nord: {
    light: {
      bg: '#2e3440', card: '#3b4252', bar: '#3b4252', fg: '#d8dee9', muted: '#7b88a1',
      border: '#434c5e', accent: '#88c0d0', danger: '#e57171', blockBg: '#353b49',
    },
  },
  solarized: {
    light: {
      bg: '#fdf6e3', card: '#f5eed9', bar: '#f5eed9', fg: '#586e75', muted: '#93a1a1',
      border: '#ddd6c1', accent: '#268bd2', danger: '#dc322f', blockBg: '#f2ebd8',
    },
  },
  dracula: {
    light: {
      bg: '#282a36', card: '#343746', bar: '#2e303e', fg: '#f8f8f2', muted: '#6272a4',
      border: '#44475a', accent: '#bd93f9', danger: '#ff5555', blockBg: '#343746',
    },
  },
  'github-light': {
    light: {
      bg: '#f6f8fa', card: '#ffffff', bar: '#ffffff', fg: '#1f2328', muted: '#656d76',
      border: '#d0d7de', accent: '#0969da', danger: '#cf222e', blockBg: '#f6f8fa',
    },
  },
};

const STORAGE_KEY = 'theme_name_v1';
const LEGACY_KEY = 'theme_mode';

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  /** 循环切换 6 套主题 */
  cycleTheme: () => void;
  /** 主题实际是否为深色 */
  isDark: boolean;
  colors: Palette;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function paletteOf(theme: ThemeName, dark: boolean): Palette {
  const entry = PALETTES[theme];
  return dark && entry.dark ? entry.dark : entry.light;
}

function isDarkOf(theme: ThemeName, systemScheme: string | null | undefined): boolean {
  const option = THEMES.find((t) => t.id === theme);
  if (!option || option.dark === 'system') return systemScheme === 'dark';
  return option.dark;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeName>('default');

  // 启动时恢复上次的选择（兼容旧版 light/dark/system 设置 → default）
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored && THEMES.some((t) => t.id === stored)) {
          setThemeState(stored as ThemeName);
          return;
        }
        // 旧 key 迁移：旧版仅深浅切换，统一回默认主题
        return AsyncStorage.getItem(LEGACY_KEY).then((legacy) => {
          if (legacy && legacy !== 'system') {
            // 曾显式选择深/浅 → 保留为对应观感的默认主题（跟随系统）
            return AsyncStorage.setItem(STORAGE_KEY, 'default');
          }
          return undefined;
        });
      })
      .catch(() => {
        // 读取失败保持默认
      });
  }, []);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // 忽略持久化失败
    });
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const idx = THEMES.findIndex((t) => t.id === prev);
      const next = THEMES[(idx + 1) % THEMES.length].id;
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
        // 忽略持久化失败
      });
      return next;
    });
  }, []);

  const isDark = isDarkOf(theme, systemScheme);
  const colors = useMemo(() => paletteOf(theme, isDark), [theme, isDark]);

  const value = useMemo(
    () => ({ theme, setTheme, cycleTheme, isDark, colors }),
    [theme, setTheme, cycleTheme, isDark, colors],
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
