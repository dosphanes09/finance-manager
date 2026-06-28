export type BankId =
  | "isbank"
  | "garanti"
  | "akbank"
  | "yapikredi"
  | "qnb"
  | "enpara"
  | "vakifbank"
  | "halkbank"
  | "ziraat"
  | "kuveytturk"
  | "generic";

export type TransactionType = "debit" | "credit";
export type TransactionKind =
  | "pos"
  | "eft"
  | "fast"
  | "atm_withdrawal"
  | "atm_deposit"
  | "credit_card_payment"
  | "salary"
  | "refund"
  | "bill"
  | "subscription"
  | "investment"
  | "transfer"
  | "fee"
  | "interest"
  | "cashback"
  | "other";

export interface NormalizedTransaction {
  date: string;
  description: string;
  merchant: string;
  amount: number;
  currency: string;
  transactionType: TransactionType;
  transactionKind: TransactionKind;
  balance: number | null;
  category: string;
  parser: BankId;
  confidence: number;
  categorizationConfidence: number;
  categorizationSource: string;
  categorizationExplanation: string;
}

export interface StatementLayout {
  transactionTable: string;
  dateFormats: string[];
  amountFormats: string[];
  debitCreditColumns: string;
  balanceColumns: string;
  multilineDescriptions: boolean;
  recurringPatterns: string[];
}

export interface DiscoveredRule {
  pattern: string;
  merchant: string;
  category: string;
  transactionCount: number;
  confidence: number;
}

export interface RecurringSubscription {
  merchant: string;
  category: string;
  months: string[];
  medianAmount: number;
  confidence: number;
}

export interface SalarySignal {
  merchant: string;
  date: string;
  amount: number;
  confidence: number;
}

export interface StatementParseResult {
  bank: BankId;
  parser: string;
  confidence: number;
  layout: StatementLayout;
  transactions: NormalizedTransaction[];
  discoveredRules: DiscoveredRule[];
  recurringSubscriptions: RecurringSubscription[];
  salarySignals: SalarySignal[];
  warnings: string[];
}

export interface StatementParser {
  readonly bank: BankId;
  readonly name: string;
  detect(rawText: string): number;
  parse(rawText: string): StatementParseResult;
}
