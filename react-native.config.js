// The iCloud container is the app's own native module, not a package. Naming
// it here is what autolinking used to get from the file tree.
module.exports = {
  dependencies: {
    'icloud-drive': {
      root: __dirname + '/modules/icloud',
      platforms: { ios: { podspecPath: __dirname + '/modules/icloud/ios/IcloudDrive.podspec' } },
    },
  },
};
