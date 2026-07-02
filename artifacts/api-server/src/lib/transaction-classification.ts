import { normalizeCategoryId } from "@workspace/finance-categories";
import { includesAny, normalizeForMatching } from "./statement-parsers/text-utils";

export type AccountType = "checking" | "credit_card" | "cash" | "other";
export type TransactionDirection = "debit" | "credit";
export type FinancialTransactionType = "income" | "expense" | "transfer" | "refund";

export interface ClassificationInput {
  accountType?: string | null;
  direction: string;
  transactionKind?: string | null;
  merchant?: string | null;
  description?: string | null;
  category?: string | null;
  categorizationSource?: string | null;
}

export interface ClassificationResult {
  type: FinancialTransactionType;
  direction: TransactionDirection;
  category: string;
  explanation: string;
}

const CREDIT_CARD_PAYMENT_PATTERNS = [
  "kredi karti odemesi",
  "kredi karti odeme",
  "kredi karti borc odeme",
  "kredi karti borcu",
  "kart odemesi",
  "kart odeme",
  "ekstre odemesi",
  "ekstre odeme",
  "borc odemesi",
  "borc odeme",
  "kk odeme",
  "odemetesekkur",
  "odeme tesekkur",
  "subehesaptan odeme",
  "enpara.com cep subesi",
];

const TRANSFER_PATTERNS = [
  "virman",
  "havale",
  "eft",
  "fast",
  "fonlarin anlik",
  "transfer",
  "gonderen",
  "alici",
  "atm",
  "bankamatik",
];

const SALARY_PATTERNS = ["maas", "salary", "payroll", "ucret odemesi", "ucret bordro"];
const REFUND_PATTERNS = ["iade", "refund", "ters ibraz", "chargeback", "reversal", "iptal"];

export function normalizeAccountType(value: string | null | undefined): AccountType {
  if (value === "checking" || value === "credit_card" || value === "cash" || value === "other") {
    return value;
  }

  if (value === "bank" || value === "bank_account") return "checking";
  if (value === "card" || value === "creditcard") return "credit_card";
  return "other";
}

export function normalizeDirection(value: string | null | undefined): TransactionDirection {
  return value === "credit" ? "credit" : "debit";
}

export function classifyFinancialTransaction(input: ClassificationInput): ClassificationResult {
  const direction = normalizeDirection(input.direction);
  const accountType = normalizeAccountType(input.accountType);
  const transactionKind = input.transactionKind ?? "other";
  const normalizedText = normalizeForMatching(`${input.merchant ?? ""} ${input.description ?? ""}`);
  const category = normalizeCategoryId(input.category);
  const source = input.categorizationSource ?? "";

  if (transactionKind === "salary" || includesAny(normalizedText, SALARY_PATTERNS)) {
    return {
      type: "income",
      direction,
      category: category === "other" ? "income" : category,
      explanation: "Salary pattern matched; counted as true income.",
    };
  }

  if (transactionKind === "refund" || includesAny(normalizedText, REFUND_PATTERNS)) {
    return {
      type: "refund",
      direction,
      category,
      explanation: "Refund/reversal pattern matched; excluded from income and expense totals by default.",
    };
  }

  if (
    transactionKind === "credit_card_payment" ||
    includesAny(normalizedText, CREDIT_CARD_PAYMENT_PATTERNS)
  ) {
    return {
      type: "transfer",
      direction,
      category: shouldKeepUserCategory(source) ? category : category === "income" ? "other" : category,
      explanation: "Credit card payment pattern matched; classified as transfer to avoid double counting.",
    };
  }

  if (
    transactionKind === "transfer" ||
    transactionKind === "eft" ||
    transactionKind === "fast" ||
    transactionKind === "atm_withdrawal" ||
    transactionKind === "atm_deposit" ||
    includesAny(normalizedText, TRANSFER_PATTERNS)
  ) {
    return {
      type: "transfer",
      direction,
      category: shouldKeepUserCategory(source) ? category : category === "income" ? "other" : category,
      explanation: `${accountTypeLabel(accountType)} transfer pattern matched; excluded from spending and income charts.`,
    };
  }

  return {
    type: direction === "credit" ? "income" : "expense",
    direction,
    category,
    explanation: direction === "credit"
      ? "Incoming transaction without transfer/refund pattern; counted as income."
      : "Outgoing transaction without transfer/refund pattern; counted as expense.",
  };
}

export function isTransferLike(type: string | null | undefined) {
  return type === "transfer" || type === "refund";
}

function shouldKeepUserCategory(source: string) {
  return source === "custom_rule" || source === "merchant_memory" || source === "user_preview" || source === "user_correction";
}

function accountTypeLabel(accountType: AccountType) {
  const labels: Record<AccountType, string> = {
    checking: "Bank account",
    credit_card: "Credit card",
    cash: "Cash account",
    other: "Account",
  };
  return labels[accountType];
}
