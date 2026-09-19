const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/** Metro's own defaults; the Expo preset used to stand in for this. */
module.exports = mergeConfig(getDefaultConfig(__dirname), {});
