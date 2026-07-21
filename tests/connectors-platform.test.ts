import { describe, it, expect } from "vitest";
import { createReferenceConnectors, CONNECTOR_SPECS } from "@/lib/connectors/connectors";
import { createDefaultRegistry } from "@/lib/connectors/registry";
import { normalizePayload, NORMALIZED_FOR_EVENT } from "@/lib/connectors/normalize";
import { CONNECTOR_IDS, BUSINESS_EVENT_TYPES } from "@/lib/connectors/types";

const clock = () => { let t = 0; return () => (t += 100); };

describe("Reference connectors", () => {
  it("provides all 17 supported connectors, each implementing the interface", () => {
    const connectors = createReferenceConnectors();
    expect(connectors.length).toBe(CONNECTOR_IDS.length);
    expect(connectors.length).toBe(17);
    for (const c of connectors) {
      const caps = c.capabilities();
      expect(caps.id).toBe(c.id);
      expect(caps.polling).toBe(true);
      expect(c.supportedEvents().length).toBeGreaterThan(0);
      expect(typeof c.connect).toBe("function");
      expect(typeof c.handleWebhook).toBe("function");
    }
  });

  it("polls deterministic normalized Business Events", async () => {
    const c = createReferenceConnectors(clock())[0];
    await c.connect();
    const a = await createReferenceConnectors()[0].poll({ tenant: "t1", cursor: 0 });
    const b = await createReferenceConnectors()[0].poll({ tenant: "t1", cursor: 0 });
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events)); // deterministic
    for (const e of a.events) {
      expect(e.tenant).toBe("t1");
      expect(e.normalizedPayload.kind).toBe(NORMALIZED_FOR_EVENT[e.type]);
      expect(e.confidence).toBeGreaterThan(0);
      expect(Object.keys(e.normalizedPayload.metrics).length).toBeGreaterThan(0);
    }
  });

  it("connect/disconnect/health/status transition correctly", async () => {
    const c = createReferenceConnectors(clock()).find((x) => x.id === "stripe")!;
    expect(c.status().state).toBe("disconnected");
    await c.connect();
    expect(c.status().state).toBe("connected");
    expect((await c.health()).healthy).toBe(true);
    await c.disconnect();
    expect(c.status().state).toBe("disconnected");
  });

  it("historical sync replays more windows than incremental", async () => {
    const c = createReferenceConnectors();
    const inc = await c[0].poll({ tenant: "t", cursor: 0, historical: false });
    const hist = await c[0].poll({ tenant: "t", cursor: 0, historical: true });
    expect(hist.events.length).toBeGreaterThan(inc.events.length);
  });

  it("webhooks produce Business Events", () => {
    const c = createReferenceConnectors().find((x) => x.id === "stripe")!;
    const events = c.handleWebhook({ type: "RevenueReceived", data: { amount: 999, transactions: 3 } }, "t1");
    expect(events.length).toBe(1);
    expect(events[0].normalizedPayload.metrics.amount).toBe(999);
  });
});

describe("Normalization layer", () => {
  it("maps every business event type to a normalized kind", () => {
    for (const t of BUSINESS_EVENT_TYPES) expect(NORMALIZED_FOR_EVENT[t]).toBeTruthy();
  });
  it("canonicalizes provider aliases (impressions→impressions, revenue→amount)", () => {
    const np = normalizePayload("RevenueReceived", { revenue: 500, orders: 5, channel: "checkout" });
    expect(np.kind).toBe("revenue");
    expect(np.metrics.amount).toBe(500);
    expect(np.metrics.transactions).toBe(5);
    expect(np.dimensions.channel).toBe("checkout");
  });
});

describe("Connector Registry", () => {
  it("looks up by capability, version and health", async () => {
    const reg = createDefaultRegistry(clock());
    expect(reg.list().length).toBe(17);
    expect(reg.withCapability("webhooks").length).toBeGreaterThan(0);
    expect(reg.withCapability("oauth").length).toBeGreaterThan(0);
    expect(reg.version("stripe")).toBe("ref-1");
    expect((await reg.health()).length).toBe(17);
  });

  it("falls back within a category when the primary is not connected", async () => {
    const reg = createDefaultRegistry(clock());
    await reg.get("linkedin")!.connect(); // another social connector is connected
    const fallback = await reg.available("x"); // x not connected
    expect(fallback).not.toBeNull();
  });

  it("every connector spec is well-formed", () => {
    for (const [id, spec] of Object.entries(CONNECTOR_SPECS)) {
      expect(spec.label).toBeTruthy();
      expect(spec.events.length).toBeGreaterThan(0);
      expect(CONNECTOR_IDS).toContain(id);
    }
  });
});
