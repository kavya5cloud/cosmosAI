import { planAssets } from "@/lib/creative/asset-planner";
import type { PlannerInput } from "@/lib/creative/types";

// Launch — the flagship section. Shows the deterministic Asset Planner output for a
// representative product launch so the end-to-end shape (Mission → Campaign → Brief →
// Asset Plan) is visible before generation is wired. The plan is computed by the same
// planAssets() the /api/creative/plan endpoint uses — no mock data.
const SAMPLE: PlannerInput = {
  mission: "Launch the product",
  campaign: { goal: "launch_product", title: "Product Launch", channels: ["articles", "linkedin", "x", "email"] },
  brief: {
    objective: "Launch the product to its core audience",
    audience: "your audience",
    keyMessage: "the one thing that matters",
    emotionalAngle: "confidence",
    proof: "your proof point",
    cta: "get started",
    visualDirection: "on-brand",
    successMetric: "signups",
  },
};

const STAGE_LABEL: Record<string, string> = {
  foundation: "Foundation",
  amplification: "Amplification",
  distribution: "Distribution",
  conversion: "Conversion",
};

export default function LaunchPage() {
  const plan = planAssets(SAMPLE);
  return (
    <section className="st-section">
      <header className="st-shead">
        <span className="label">🚀 Launch</span>
        <h1>Complete product launches, planned end-to-end.</h1>
        <p>
          Every launch starts from a mission and campaign brief. The Asset Planner turns it
          into an ordered, dependency-aware plan — deterministically, before a single asset is generated.
        </p>
      </header>

      <div className="st-plan">
        {plan.stages.map((stage) => (
          <div key={stage} className="st-plan-stage">
            <div className="st-plan-stage-h">{STAGE_LABEL[stage] ?? stage}</div>
            <ol className="st-plan-list">
              {plan.assets.filter((a) => a.stage === stage).map((a) => (
                <li key={a.key} className="st-plan-item">
                  <span className="st-plan-num">{a.order}</span>
                  <span className="st-plan-label">
                    {a.quantity > 1 ? `${a.quantity} × ` : ""}{a.label}
                  </span>
                  <span className="st-plan-ch">{a.channel}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <p className="st-plan-foot">
        {plan.summary.total} planned assets · every one routes through the Creative Director
        and Approval Council before publishing.
      </p>
    </section>
  );
}
