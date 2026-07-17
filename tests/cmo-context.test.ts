import { describe, it, expect } from "vitest";
import { confidenceOf, type ContextSignals } from "../lib/services/cmo-context";

const base: ContextSignals = {
  hasProfile: false, missionCount: 0, scoredOutcomes: 0,
  approvedActions: 0, dismissedActions: 0, hasLiveMetrics: false,
};

describe("confidenceOf", () => {
  it("is cold with no history", () => {
    expect(confidenceOf(base)).toBe("cold");
    expect(confidenceOf({ ...base, hasProfile: true })).toBe("cold");
  });

  it("is thin with a profile plus a mission or approvals or live metrics but no outcomes", () => {
    expect(confidenceOf({ ...base, hasProfile: true, missionCount: 1 })).toBe("thin");
    expect(confidenceOf({ ...base, hasProfile: true, approvedActions: 3 })).toBe("thin");
    expect(confidenceOf({ ...base, hasProfile: true, hasLiveMetrics: true })).toBe("thin");
  });

  it("is rich once there are measured outcomes", () => {
    expect(confidenceOf({ ...base, hasProfile: true, scoredOutcomes: 1 })).toBe("rich");
  });

  it("is rich with an active mission and live metrics even before scoring", () => {
    expect(confidenceOf({ ...base, hasProfile: true, missionCount: 2, hasLiveMetrics: true })).toBe("rich");
  });

  it("never returns thin without a profile", () => {
    // Activity but no profile → still cold (we don't know who the business is).
    expect(confidenceOf({ ...base, missionCount: 2, approvedActions: 5 })).toBe("cold");
  });
});
