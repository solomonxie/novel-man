module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['@react-native/babel-preset'],
    // Worklets rewrites the functions that run on the UI thread; it has to be
    // last, and babel-preset-expo used to add it unasked.
    plugins: ['react-native-worklets/plugin'],
  };
};
