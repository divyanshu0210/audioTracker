const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');
const {
    wrapWithReanimatedMetroConfig,
  } = require('react-native-reanimated/metro-config');
/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Use youtubei.js's prebuilt React Native bundle. Its ESM source contains
    // namespace re-exports that this app's Babel preset cannot transform.
    unstable_enablePackageExports: true,
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'youtubei.js') {
        return {
          type: 'sourceFile',
          filePath: path.join(
            __dirname,
            'node_modules',
            'youtubei.js',
            'bundle',
            'react-native.js',
          ),
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = wrapWithReanimatedMetroConfig(mergeConfig(getDefaultConfig(__dirname), config));
