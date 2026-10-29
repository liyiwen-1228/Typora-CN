const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 让 .html 文件可以作为静态资源被 require() 引用，
// 供 WebView 通过 expo-asset 加载打包好的编辑器页面（assets/editor.html）。
if (!config.resolver.assetExts.includes('html')) {
  config.resolver.assetExts.push('html');
}

module.exports = config;
