import { detectBank } from "./bank-detector";
import type { StatementParseResult } from "./types";

export { detectBank } from "./bank-detector";
export {
  detectRecurringSubscriptions,
  detectSalaryTransactions,
  discoverMerchantRules,
  normalizeMerchant,
} from "./merchant-normalizer";
export type {
  BankId,
  DiscoveredRule,
  NormalizedTransaction,
  RecurringSubscription,
  SalarySignal,
  StatementLayout,
  StatementParseResult,
  TransactionType,
} from "./types";

export function parseStatementText(rawText: string): StatementParseResult {
  const detection = detectBank(rawText);
  const result = detection.parser.parse(rawText);

  return {
    ...result,
    confidence: Math.min(0.99, Math.max(result.confidence, detection.confidence)),
  };
}
