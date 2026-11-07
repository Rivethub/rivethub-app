export interface Mailer {
  sendMagicLink(to: string, link: string): Promise<void>;
}

const SUBJECT = "Sign in to RivetHub";

function body(link: string): string {
  return [
    "Open this link to sign in to RivetHub:",
    "",
    link,
    "",
    "It works once and expires in 15 minutes. If you did not ask for it, ignore this email.",
  ].join("\n");
}

export function resendMailer(apiKey: string, from: string, fetcher: typeof fetch = fetch): Mailer {
  return {
    async sendMagicLink(to, link) {
      const res = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to, subject: SUBJECT, text: body(link) }),
      });
      if (!res.ok) throw new Error(`resend send failed: HTTP ${res.status}`);
    },
  };
}

export function devMailer(write: (line: string) => void = (l) => process.stdout.write(l)): Mailer {
  return {
    async sendMagicLink(to, link) {
      write(JSON.stringify({ dev: "magic-link", to, link }) + "\n");
    },
  };
}
