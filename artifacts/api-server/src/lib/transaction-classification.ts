import { normalizeCategoryId } from "@workspace/finance-categories";
import { includesAny, normalizeForMatching } from "./statement-parsers/text-utils";

export type AccountType = "checking" | "credit_card" | "cash" | "other";
export type StatementType = "bank_account" | "credit_card_statement";
export type TransactionDirection = "debit" | "credit";
export type FinancialTransactionType =
  | "income"
  | "expense"
  | "transfer"
  | "credit_card_payment"
  | "refund"
  | "fee"
  | "unknown_review";

export interface ClassificationInput {
  accountType?: string | null;
  statementType?: StatementType | null;
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
  "kredi karti tahsilati",
  "kart tahsilati",
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
const FEE_PATTERNS = ["komisyon", "masraf", "ucret", "aidat", "bsmv", "kkdf", "tahsilat ucreti"];
const OWN_ACCOUNT_TRANSFER_PATTERNS = ["virman", "kendi hesab", "hesaplarim arasi", "nakit cekim", "atm para cekme", "atm para yatirma"];
const POS_PATTERNS = ["pos alisveris", "sanal pos", "alisveris", "harcama", "is yeri", "isyeri"];

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
  const statementType = input.statementType ?? (accountType === "credit_card" ? "credit_card_statement" : "bank_account");
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

  if (transactionKind === "fee" || includesAny(normalizedText, FEE_PATTERNS)) {
    return {
      type: "fee",
      direction,
      category,
      explanation: "Fee/commission/tax pattern matched; counted with real expenses, not income.",
    };
  }

  if (
    transactionKind === "credit_card_payment" ||
    includesAny(normalizedText, CREDIT_CARD_PAYMENT_PATTERNS)
  ) {
    return {
      type: "credit_card_payment",
      direction,
      category: shouldKeepUserCategory(source) ? category : category === "income" ? "other" : category,
      explanation: `${statementTypeLabel(statementType)} credit card payment/settlement pattern matched; excluded from income and spending totals.`,
    };
  }

  if (transactionKind === "pos" || includesAny(normalizedText, POS_PATTERNS)) {
    return {
      type: direction === "credit" ? "refund" : "expense",
      direction,
      category,
      explanation: direction === "credit"
        ? "POS reversal/refund-like credit matched; reduces expenses."
        : "POS/card spending pattern matched; counted as real expense.",
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
    if ((transactionKind === "atm_withdrawal" || transactionKind === "atm_deposit") && accountType !== "cash") {
      return {
        type: "unknown_review",
        direction,
        category,
        explanation: "ATM cash movement needs review unless a cash account is used for the matching side.",
      };
    }

    if (direction === "credit" && !includesAny(normalizedText, OWN_ACCOUNT_TRANSFER_PATTERNS)) {
      return {
        type: "unknown_review",
        direction,
        category: category === "income" ? "other" : category,
        explanation: "Incoming EFT/FAST/Havale is ambiguous; marked for review instead of counting as income.",
      };
    }

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
  return type === "transfer" || type === "credit_card_payment" || type === "refund";
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

function statementTypeLabel(statementType: StatementType) {
  return statementType === "credit_card_statement" ? "Credit card statement" : "Bank account statement";
}
