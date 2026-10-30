import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  effectiveKeymap,
  type KeymapOverrides,
} from '../commands/registry';

/** 编辑器设置（XT-02） */
export interface EditorPrefs {
  /** 字号 14–22px */
  fontSize: number;
  /** 行高 1.4–2.0 */
  lineHeight: number;
  /** 等宽字体 */
  fontFamily: string;
}

export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "'SF Mono', Menlo, Consolas, 'PingFang SC', monospace", label: 'SF Mono（默认）' },
  { value: 'Menlo, monospace', label: 'Menlo' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
  { value: "'PingFang SC', 'Microsoft YaHei', sans-serif", label: '系统字体' },
];

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 22;
export const LINE_HEIGHT_MIN = 1.4;
export const LINE_HEIGHT_MAX = 2.0;

export const DEFAULT_PREFS: EditorPrefs = {
  fontSize: 16,
  lineHeight: 1.7,
  fontFamily: FONT_OPTIONS[0].value,
};

interface AppSettingsData {
  prefs: EditorPrefs;
  customCss: string;
  keymap: KeymapOverrides;
  focusMode: boolean;
  typewriterMode: boolean;
}

const DEFAULT_DATA: AppSettingsData = {
  prefs: DEFAULT_PREFS,
  customCss: '',
  keymap: {},
  focusMode: false,
  typewriterMode: false,
};

const STORAGE_KEY = 'app_settings_v1';

interface SettingsContextValue extends AppSettingsData {
  /** 生效快捷键表（默认 ⊕ 覆盖） */
  effectiveKeys: Record<string, string>;
  setPrefs: (prefs: Partial<EditorPrefs>) => void;
  setCustomCss: (css: string) => void;
  setKeymapOverrides: (overrides: KeymapOverrides) => void;
  setKeyOverride: (commandId: string, combo: string | null) => void;
  resetKeyOverride: (commandId: string) => void;
  resetAllKeymap: () => void;
  setFocusMode: (on: boolean) => void;
  setTypewriterMode: (on: boolean) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppSettingsData>(DEFAULT_DATA);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        try {
          const parsed = JSON.parse(stored) as Partial<AppSettingsData>;
          setData((prev) => ({
            ...prev,
            prefs: { ...prev.prefs, ...(parsed.prefs ?? {}) },
            customCss: typeof parsed.customCss === 'string' ? parsed.customCss : '',
            keymap: parsed.keymap && typeof parsed.keymap === 'object' ? parsed.keymap : {},
            focusMode: Boolean(parsed.focusMode),
            typewriterMode: Boolean(parsed.typewriterMode),
          }));
        } catch {
          // 解析失败保持默认
        }
      })
      .catch(() => {
        // 读取失败保持默认
      });
  }, []);

  const persist = useCallback((next: AppSettingsData) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
      // 忽略持久化失败
    });
  }, []);

  const update = useCallback(
    (patch: Partial<AppSettingsData>) => {
      setData((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setPrefs = useCallback(
    (prefs: Partial<EditorPrefs>) => {
      setData((prev) => {
        const next = { ...prev, prefs: { ...prev.prefs, ...prefs } };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setKeyOverride = useCallback(
    (commandId: string, combo: string | null) => {
      setData((prev) => {
        const next = { ...prev, keymap: { ...prev.keymap, [commandId]: combo } };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetKeyOverride = useCallback(
    (commandId: string) => {
      setData((prev) => {
        const keymap = { ...prev.keymap };
        delete keymap[commandId];
        const next = { ...prev, keymap };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const resetAllKeymap = useCallback(() => {
    update({ keymap: {} });
  }, [update]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...data,
      effectiveKeys: effectiveKeymap(data.keymap),
      setPrefs,
      setCustomCss: (customCss: string) => update({ customCss }),
      setKeymapOverrides: (keymap: KeymapOverrides) => update({ keymap }),
      setKeyOverride,
      resetKeyOverride,
      resetAllKeymap,
      setFocusMode: (focusMode: boolean) => update({ focusMode }),
      setTypewriterMode: (typewriterMode: boolean) => update({ typewriterMode }),
    }),
    [data, setPrefs, update, setKeyOverride, resetKeyOverride, resetAllKeymap],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings 必须在 SettingsProvider 内使用');
  }
  return ctx;
}
