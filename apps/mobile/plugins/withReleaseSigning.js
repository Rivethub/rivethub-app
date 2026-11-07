const { createRequire } = require("module");
const { withAppBuildGradle } = createRequire(require.resolve("expo/package.json"))("@expo/config-plugins");

const RELEASE_CONFIG = `
        release {
            if (project.hasProperty('RIVETHUB_UPLOAD_STORE_FILE')) {
                storeFile file(RIVETHUB_UPLOAD_STORE_FILE)
                storePassword RIVETHUB_UPLOAD_STORE_PASSWORD
                keyAlias RIVETHUB_UPLOAD_KEY_ALIAS
                keyPassword RIVETHUB_UPLOAD_KEY_PASSWORD
            }
        }`;

/** Sign release builds with the key named in ~/.gradle/gradle.properties (RIVETHUB_UPLOAD_*), so the key never lives in the repo. Without it, release falls back to the debug key. */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes("RIVETHUB_UPLOAD_STORE_FILE")) return mod;
    gradle = gradle.replace(/(signingConfigs \{\n\s*debug \{[^}]*\})/, `$1${RELEASE_CONFIG}`);
    gradle = gradle.replace(
      /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
      "$1signingConfig project.hasProperty('RIVETHUB_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    mod.modResults.contents = gradle;
    return mod;
  });
}

module.exports = withReleaseSigning;
