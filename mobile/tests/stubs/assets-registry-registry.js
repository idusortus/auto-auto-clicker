// assets-registry-registry.js — resolution shim for the RN jest preset.
//
// react-native 0.87 replaced `@react-native/assets-registry` with
// `@react-native/asset-utils`, but `jest-expo@57`'s preset still resolves the
// old `@react-native/assets-registry/registry` path during setup. jest-expo
// installs its own mock factory at that path, so this module only needs to
// resolve; the shape below mirrors what RN's Image expects if it is ever used
// unmocked.

module.exports = {
  registerAsset() {
    return 1;
  },
  getAssetByID() {
    return undefined;
  },
};
