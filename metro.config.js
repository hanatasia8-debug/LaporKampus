const path = require('path');

let getDefaultConfig, mergeConfig;
try {
  ({ getDefaultConfig, mergeConfig } = require('@expo/metro-config'));
} catch {
  try {
    ({ getDefaultConfig, mergeConfig } = require('@react-native/metro-config'));
  } catch {
    ({ getDefaultConfig, mergeConfig } = require('metro-config'));
  }
}

/**
 * Metro configuration
 * Compatible with React Native CLI & Expo Dev Client
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
module.exports = (async () => {
  const defaultConfig = typeof getDefaultConfig === 'function' ? await getDefaultConfig(__dirname) : {};
  const customConfig = {
    projectRoot: path.resolve(__dirname),
    watchFolders: [path.resolve(__dirname)],
    transformer: {
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          inlineRequires: true,
        },
      }),
    },
  };
  return mergeConfig ? mergeConfig(defaultConfig, customConfig) : customConfig;
})();
