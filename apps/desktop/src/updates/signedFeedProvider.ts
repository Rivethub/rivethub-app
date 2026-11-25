import type { UpdateInfo } from "electron-updater";
import { Provider, parseUpdateInfo, resolveFiles, type ProviderRuntimeOptions } from "electron-updater/out/providers/Provider";
import type { ResolvedUpdateFileInfo } from "electron-updater/out/types";

import { acceptManifest, type TrustedReleaseKey } from "./verifySignature";

export interface SignedFeedOptions {
  /** The channel's directory, ending in a slash. */
  url: string;
  requireSignature: boolean;
  keyring?: readonly TrustedReleaseKey[];
}

/**
 * electron-updater's generic provider, except that the manifest is fetched once with its .sig and
 * verified before it is parsed. Every update decision (version, files, sha512, the .deb link) reads
 * the UpdateInfo parsed from those verified bytes. Pass the result as a custom `updateProvider`.
 */
export function signedFeedProvider(options: SignedFeedOptions) {
  const baseUrl = new URL(options.url);
  return class SignedFeedProvider extends Provider<UpdateInfo> {
    constructor(_publish: unknown, _updater: unknown, runtimeOptions: ProviderRuntimeOptions) {
      super(runtimeOptions);
    }

    override async getLatestVersion(): Promise<UpdateInfo> {
      const manifestName = `${this.getDefaultChannelName()}.yml`;
      const manifestUrl = new URL(manifestName, baseUrl);
      const [manifest, signature] = await Promise.all([
        this.httpRequest(manifestUrl),
        this.httpRequest(new URL(`${manifestName}.sig`, baseUrl)).then(
          (body) => body ?? "",
          (error: unknown) => {
            if ((error as { statusCode?: unknown }).statusCode === 404) return null;
            throw error;
          },
        ),
      ]);
      if (manifest === null) throw new Error(`${manifestName} is empty.`);
      return parseUpdateInfo(acceptManifest(manifest, signature, options), manifestName, manifestUrl);
    }

    override resolveFiles(updateInfo: UpdateInfo): ResolvedUpdateFileInfo[] {
      return resolveFiles(updateInfo, baseUrl);
    }
  };
}
