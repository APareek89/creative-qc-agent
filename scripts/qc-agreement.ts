import { readFile } from "node:fs/promises";
import { evaluateQcAgreement, type QcAgreementSample } from "../src/lib/evals/qc-agreement";

const fixture: QcAgreementSample[] = [
  { id: "approved-1", humanApproved: true, qcPassed: true },
  { id: "approved-2", humanApproved: true, qcPassed: true },
  { id: "approved-3", humanApproved: true, qcPassed: true },
  { id: "approved-4", humanApproved: true, qcPassed: true },
  { id: "approved-5", humanApproved: true, qcPassed: true },
  { id: "holdout-reject-1", humanApproved: false, qcPassed: false },
  { id: "holdout-reject-2", humanApproved: false, qcPassed: true },
];

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  const samples = inputPath
    ? JSON.parse(await readFile(inputPath, "utf8")) as QcAgreementSample[]
    : fixture;
  console.log(JSON.stringify(evaluateQcAgreement(samples), null, 2));
}

void main();
