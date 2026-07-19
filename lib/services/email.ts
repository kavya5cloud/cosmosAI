// Email provider abstraction — the seam every transactional/marketing email flows
// through. Today only Resend is wired; Mailchimp, Loops, Postmark, etc. can be added
// as new providers implementing EmailProvider without touching call sites.
//
// Design rules:
//   - Sending is ALWAYS best-effort. A missing/failed provider returns a result with
//     sent:false and never throws — capturing an application must never depend on email.
//   - Provider selection is env-driven so infra can swap transports without a code change.

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type EmailResult = { sent: boolean; provider: string; detail?: string };

export interface EmailProvider {
  readonly name: string;
  /** True when the provider has the config it needs to actually deliver. */
  readonly configured: boolean;
  send(msg: EmailMessage): Promise<EmailResult>;
}

const FROM = () => process.env.EARLY_ACCESS_FROM || "Populr <team@trypopulr.in>";

/** Resend (https://resend.com). Active when RESEND_API_KEY is set. */
class ResendProvider implements EmailProvider {
  readonly name = "resend";
  get configured() {
    return !!process.env.RESEND_API_KEY;
  }
  async send(msg: EmailMessage): Promise<EmailResult> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return { sent: false, provider: this.name, detail: "no_key" };
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM(),
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          ...(msg.html ? { html: msg.html } : {}),
        }),
      });
      return { sent: r.ok, provider: this.name, detail: r.ok ? undefined : "http_" + r.status };
    } catch (e) {
      return { sent: false, provider: this.name, detail: String(e).slice(0, 120) };
    }
  }
}

/** No-op fallback so callers get a clean sent:false when nothing is configured. */
class NoopProvider implements EmailProvider {
  readonly name = "noop";
  readonly configured = false;
  async send(): Promise<EmailResult> {
    return { sent: false, provider: this.name, detail: "not_configured" };
  }
}

// Registry keyed by EMAIL_PROVIDER (defaults to resend). Add future transports here.
const PROVIDERS: Record<string, () => EmailProvider> = {
  resend: () => new ResendProvider(),
  noop: () => new NoopProvider(),
};

/** The active provider. Falls back to noop when the configured one has no credentials. */
export function getEmailProvider(): EmailProvider {
  const chosen = (process.env.EMAIL_PROVIDER || "resend").toLowerCase();
  const provider = (PROVIDERS[chosen] ?? PROVIDERS.resend)();
  return provider.configured ? provider : new NoopProvider();
}

/** Convenience: best-effort send through the active provider. Never throws. */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  return getEmailProvider().send(msg);
}
