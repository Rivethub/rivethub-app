const fs = require("fs");
const { createRequire } = require("module");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = createRequire(require.resolve("expo/package.json"))(
  "@expo/config-plugins",
);

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

/** Trust CAs the person installs on the phone, so a private Rivet mesh CA can verify the hub. */
function withUserCa(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "network_security_config.xml"), XML);
      return mod;
    },
  ]);
}

module.exports = withUserCa;
