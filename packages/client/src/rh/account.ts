import type { Account, Hub, Me, SignInProgress } from "@rivethub/contracts";
import type { Http } from "../http.js";
import * as wire from "./wire.js";
import { strip } from "./util.js";

const mapAccount = (account: wire.AccountWire): Account =>
  strip<Account>(account);

export function accountApi(http: Http) {
  return {
    me: () => http.get("/api/me", wire.me),
    async account(): Promise<Account> {
      return mapAccount(await http.get("/api/account", wire.account));
    },

    async me(): Promise<Me> {
      return strip<Me>(await http.get("/api/me", wire.me));
    },

    updateAccount: (patch: Partial<Pick<Account, "channel" | "autoDownload" | "crashReports" | "usageCounts" | "updateSource">>) =>
      http.send("PATCH", "/api/account", patch),

    signIn: (email: string) => http.sendFor("POST", "/api/account/signin", wire.signInStarted, { email }),

    async pollSignIn(): Promise<SignInProgress> {
      const progress = await http.sendFor("POST", "/api/account/signin/poll", wire.signInProgress);
      return progress.status === "pending" ? { status: "pending" } : { status: "signed-in", account: mapAccount(progress.account) };
    },

    async signOut(): Promise<Account> {
      return mapAccount(await http.sendFor("POST", "/api/account/signout", wire.account));
    },

    async deleteAccount(): Promise<Account> {
      return mapAccount(await http.sendFor("DELETE", "/api/account", wire.account));
    },

    async hubs(): Promise<Hub[]> {
      return (await http.get("/api/hubs", wire.hubList)) as Hub[];
    },
  };
}
