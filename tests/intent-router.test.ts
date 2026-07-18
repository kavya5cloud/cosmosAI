import { describe, it, expect } from "vitest";
import { routeIntent } from "../lib/services/intent-router";

describe("routeIntent", () => {
  it("routes content requests to content (the reported bug)", () => {
    expect(routeIntent("give me something to post on x").intent).toBe("content");
    expect(routeIntent("write an x post").intent).toBe("content");
    expect(routeIntent("generate a linkedin post").intent).toBe("content");
    expect(routeIntent("draft a reddit comment").intent).toBe("content");
    expect(routeIntent("create a blog").intent).toBe("content");
  });

  it("extracts the asset kind", () => {
    expect(routeIntent("write an x thread about pricing").asset).toBe("x_thread");
    expect(routeIntent("give me a linkedin post").asset).toBe("linkedin_post");
    expect(routeIntent("make an instagram carousel").asset).toBe("ig_carousel");
    expect(routeIntent("write 5 headlines").asset).toBe("headlines");
  });

  it("routes strategy questions to strategy", () => {
    expect(routeIntent("what should i do next?").intent).toBe("strategy");
    expect(routeIntent("should i focus on reddit?").intent).toBe("strategy");
    expect(routeIntent("where should i market?").intent).toBe("strategy");
  });

  it("routes analysis questions to analysis", () => {
    expect(routeIntent("why is my traffic dropping?").intent).toBe("analysis");
    expect(routeIntent("what worked last month?").intent).toBe("analysis");
    expect(routeIntent("analyze my competitors").intent).toBe("analysis");
  });

  it("routes campaign requests to campaign", () => {
    expect(routeIntent("launch my product").intent).toBe("campaign");
    expect(routeIntent("i want more users").intent).toBe("campaign");
    expect(routeIntent("create a campaign for the launch").intent).toBe("campaign");
  });

  it("routes edits to edit", () => {
    expect(routeIntent("make this shorter").intent).toBe("edit");
    expect(routeIntent("rewrite this").intent).toBe("edit");
    expect(routeIntent("make it funnier").intent).toBe("edit");
    expect(routeIntent("change the CTA").intent).toBe("edit");
  });

  it("routes transforms to transform with a target", () => {
    const t1 = routeIntent("turn this post into a thread", true);
    expect(t1.intent).toBe("transform");
    expect(t1.target).toBe("x_thread");
    expect(routeIntent("convert to linkedin", true).intent).toBe("transform");
    expect(routeIntent("turn into a carousel", true).target).toBe("ig_carousel");
  });

  it("uses selection to disambiguate terse edits/transforms", () => {
    expect(routeIntent("shorter", true).intent).toBe("edit");
    expect(routeIntent("make it a thread", true).intent).toBe("transform");
  });

  it("falls back to strategy when nothing matches and no asset named", () => {
    expect(routeIntent("hey").intent).toBe("strategy");
  });

  it("treats a bare asset mention as content", () => {
    expect(routeIntent("a punchy tweet").intent).toBe("content");
  });
});
