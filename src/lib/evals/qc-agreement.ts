export interface QcAgreementSample {
  id: string;
  humanApproved: boolean;
  qcPassed: boolean;
}

export interface QcAgreementReport {
  samples: number;
  agreements: number;
  agreementRate: number;
  precision: number;
  recall: number;
  truePositive: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

export function evaluateQcAgreement(samples: QcAgreementSample[]): QcAgreementReport {
  if (!samples.length) throw new Error("QC agreement requires at least one human-labeled sample.");
  const truePositive = samples.filter((sample) => sample.humanApproved && sample.qcPassed).length;
  const trueNegative = samples.filter((sample) => !sample.humanApproved && !sample.qcPassed).length;
  const falsePositive = samples.filter((sample) => !sample.humanApproved && sample.qcPassed).length;
  const falseNegative = samples.filter((sample) => sample.humanApproved && !sample.qcPassed).length;
  const agreements = truePositive + trueNegative;
  return {
    samples: samples.length,
    agreements,
    agreementRate: ratio(agreements, samples.length),
    precision: ratio(truePositive, truePositive + falsePositive),
    recall: ratio(truePositive, truePositive + falseNegative),
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
  };
}
