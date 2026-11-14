import type { Account, Hub, Me, SignInProgress } from "@rivethub/contracts";
import { HttpError, MalformedResponseError } from "../errors.js";
import type { Http } from "../http.js";
import * as wire from "./wire.js";
import { strip } from "./util.js";

const mapAccount = (account: wire.AccountWire): Account =>
  strip<Account>(account);

export function accountApi(http: Http) {
  return {
    async account(): Promise<Account> {
      return mapAccount(await http.get("/api/account", wire.account));
    },

    async me(): Promise<Me> {
      return strip<Me>(await http.get("/api/me", wire.me));
    },

    updateAccount: (patch: Partial<Pick<Account, "channel" | "autoDownload" | "crashReports" | "usageCounts" | "updateSource">>) =>
      http.send("PATCH", "/api/account", patch),

    async signIn() {
      try { return await http.sendFor("POST", "/api/account/signin", wire.signInStarted, {}); }
      catch (error) {
        if (!(error instanceof MalformedResponseError) && !(error instanceof HttpError && [400, 404, 410, 502].includes(error.status))) throw error;
        throw new Error("This node’s version cannot sign in to an account yet, or the account service is unavailable. Updates from GitHub work; you can continue without an account."); }
    },

    async pollSignIn(): Promise<SignInProgress> {
      const progress = await http.sendFor("POST", "/api/account/signin/poll", wire.signInProgress);
      return progress.status !== "signed-in" ? { status: progress.status } : { status: "signed-in", account: mapAccount(progress.account) };
    },

    async signOut(): Promise<Account> {
      return mapAccount(await http.sendFor("POST", "/api/account/signout", wire.account));
    },

    async deleteAccount(): Promise<Account & { accountUrl?: string }> {
      const reply = await http.sendFor("DELETE", "/api/account", wire.account.extend({ accountUrl: wire.accountUrl.optional() }));
      return { ...mapAccount(reply), ...(reply.accountUrl ? { accountUrl: reply.accountUrl } : {}) };
    },

    async hubs(): Promise<Hub[]> {
      return (await http.get("/api/hubs", wire.hubList)) as Hub[];
    },
  };
}
