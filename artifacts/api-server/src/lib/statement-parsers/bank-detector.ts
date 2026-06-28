import { EnparaParser } from "./enpara-parser";
import { GenericParser } from "./generic-parser";
import { ZiraatParser } from "./ziraat-parser";
import type { BankId, StatementParser } from "./types";

export interface BankDetectionResult {
  bank: BankId;
  confidence: number;
  parser: StatementParser;
  candidates: Array<{ bank: BankId; confidence: number; parser: string }>;
}

const PARSERS: StatementParser[] = [
  new ZiraatParser(),
  new EnparaParser(),
  new GenericParser(),
];

export function detectBank(rawText: string): BankDetectionResult {
  const candidates = PARSERS
    .map((parser) => ({
      bank: parser.bank,
      confidence: parser.detect(rawText),
      parser: parser.name,
      parserInstance: parser,
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const selected = candidates[0] ?? {
    bank: "generic" as const,
    confidence: 0,
    parser: "GenericParser",
    parserInstance: new GenericParser(),
  };

  return {
    bank: selected.bank,
    confidence: selected.confidence,
    parser: selected.parserInstance,
    candidates: candidates.map(({ bank, confidence, parser }) => ({ bank, confidence, parser })),
  };
}
