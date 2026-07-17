import { describe, expect, it } from "vitest";
import { evaluateQcAgreement } from "@/lib/evals/qc-agreement";

describe("QC versus human agreement", () => {
  it("makes disagreements explicit instead of hiding them in an average", () => {
    const report = evaluateQcAgreement([
      { id: "a", humanApproved: true, qcPassed: true },
      { id: "b", humanApproved: true, qcPassed: true },
      { id: "c", humanApproved: true, qcPassed: false },
      { id: "d", humanApproved: false, qcPassed: false },
      { id: "e", humanApproved: false, qcPassed: true },
    ]);
    expect(report.agreementRate).toBe(60);
    expect(report.falsePositive).toBe(1);
    expect(report.falseNegative).toBe(1);
    expect(report.precision).toBe(66.7);
  });

  it("rejects an empty holdout set", () => {
    expect(() => evaluateQcAgreement([])).toThrow("at least one");
  });
});
