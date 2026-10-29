import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import DocumentsScreen from './screens/DocumentsScreen';
import EditorScreen from './screens/EditorScreen';

/** 轻量页面状态（v1 不引入导航库） */
type Screen = { name: 'list' } | { name: 'editor'; path: string };

function AppInner() {
  const { isDark } = useTheme();
  const [screen, setScreen] = useState<Screen>({ name: 'list' });

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {screen.name === 'list' ? (
        <DocumentsScreen onOpen={(path) => setScreen({ name: 'editor', path })} />
      ) : (
        <EditorScreen
          key={screen.path}
          path={screen.path}
          onBack={() => setScreen({ name: 'list' })}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
