import { describe, it, expect } from "vitest";
import { validateEaInput, EA_INTERESTS } from "@/lib/early-access";
import { getEmailProvider } from "@/lib/services/email";

describe("validateEaInput", () => {
  it("requires only a valid work email", () => {
    const v = validateEaInput({ email: "founder@acme.com" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.email).toBe("founder@acme.com");
      expect(v.value.name).toBeUndefined();
      expect(v.value.interests).toEqual([]);
    }
  });

  it("rejects a missing or malformed email", () => {
    expect(validateEaInput({}).ok).toBe(false);
    const bad = validateEaInput({ email: "not-an-email" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toContain("email");
  });

  it("lowercases the email and captures the new modal fields", () => {
    const v = validateEaInput({
      email: "Founder@Acme.COM",
      company: "Acme",
      website: "acme.com",
      teamSize: "2–10",
      project: "An AI CMO",
      interests: ["launch_videos", "ai_campaigns"],
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.email).toBe("founder@acme.com");
      expect(v.value.teamSize).toBe("2–10");
      expect(v.value.project).toBe("An AI CMO");
      expect(v.value.interests).toEqual(["launch_videos", "ai_campaigns"]);
    }
  });

  it("drops unknown interests and de-duplicates", () => {
    const v = validateEaInput({ email: "a@b.com", interests: ["launch_videos", "launch_videos", "hacking", 42] });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.interests).toEqual(["launch_videos"]);
  });

  it("stays backward-compatible with the legacy name/marketingChallenge form", () => {
    const v = validateEaInput({ name: "Jane Doe", email: "jane@co.com", marketingChallenge: "no time for marketing" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.name).toBe("Jane Doe");
      // project falls back to the legacy marketingChallenge when not given separately
      expect(v.value.project).toBe("no time for marketing");
    }
  });

  it("exposes a stable interest enum", () => {
    expect(EA_INTERESTS).toContain("ai_creative_studio");
    expect(EA_INTERESTS.length).toBe(5);
  });
});

describe("email provider abstraction", () => {
  it("falls back to a no-op provider when nothing is configured", () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const p = getEmailProvider();
    expect(p.name).toBe("noop");
    expect(p.configured).toBe(false);
    if (prev) process.env.RESEND_API_KEY = prev;
  });

  it("never throws on send when unconfigured", async () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const res = await getEmailProvider().send({ to: "x@y.com", subject: "hi", text: "hi" });
    expect(res.sent).toBe(false);
    if (prev) process.env.RESEND_API_KEY = prev;
  });
});
