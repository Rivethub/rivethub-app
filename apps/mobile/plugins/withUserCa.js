const fs = require("fs");
const { createRequire } = require("module");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = createRequire(require.resolve("expo/package.json"))(
  "@expo/config-plugins",
);

const RELEASE_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

const DEBUG_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">10.0.2.2</domain> <!-- secret-scan-allow: Android Emulator host loopback alias -->
  </domain-config>
</network-security-config>
`;

function writeConfig(root, variant, xml) {
  const dir = path.join(root, `app/src/${variant}/res/xml`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "network_security_config.xml"), xml);
}

/** Trust CAs the person installs on the phone, so a private Rivet mesh CA can verify the hub. Debug builds also reach Metro over cleartext on loopback and the emulator host. */
function withUserCa(config) {
  config = withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      writeConfig(mod.modRequest.platformProjectRoot, "main", RELEASE_XML);
      writeConfig(mod.modRequest.platformProjectRoot, "debug", DEBUG_XML);
      return mod;
    },
  ]);
}

module.exports = withUserCa;
