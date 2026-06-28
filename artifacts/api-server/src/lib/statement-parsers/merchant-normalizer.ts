import { categorize } from "../categorizer";
import type {
  DiscoveredRule,
  NormalizedTransaction,
  RecurringSubscription,
  SalarySignal,
} from "./types";
import { maskSensitiveData, normalizeForMatching, removeNoisyTokens } from "./text-utils";

interface MerchantRule {
  merchant: string;
  category: string;
  patterns: string[];
  subscription?: boolean;
}

export interface MerchantNormalization {
  merchant: string;
  category: string;
  confidence: number;
  matchedPattern?: string;
}

export const MERCHANT_RULES: MerchantRule[] = [
  { merchant: "YouTube Premium", category: "subscriptions", patterns: ["youtube premium", "google *youtube", "google youtube"], subscription: true },
  { merchant: "Amazon Prime", category: "subscriptions", patterns: ["amazonprimetr", "amazon prime"], subscription: true },
  { merchant: "Spotify", category: "subscriptions", patterns: ["spotify"], subscription: true },
  { merchant: "Netflix", category: "subscriptions", patterns: ["netflix"], subscription: true },
  { merchant: "Apple", category: "subscriptions", patterns: ["apple.com", "apple store", "apple"], subscription: true },
  { merchant: "Google", category: "subscriptions", patterns: ["google"], subscription: true },
  { merchant: "Microsoft", category: "subscriptions", patterns: ["microsoft", "msft"], subscription: true },
  { merchant: "Adobe", category: "subscriptions", patterns: ["adobe"], subscription: true },
  { merchant: "Steam", category: "entertainment", patterns: ["steam"], subscription: false },
  { merchant: "Epic Games", category: "entertainment", patterns: ["epic games"], subscription: false },
  { merchant: "OpenAI", category: "subscriptions", patterns: ["openai"], subscription: true },
  { merchant: "Migros", category: "groceries", patterns: ["migros", "5m ankara", "metro kent ankara migros"] },
  { merchant: "A101", category: "groceries", patterns: ["a101", "a 101"] },
  { merchant: "Bim", category: "groceries", patterns: ["bim ", "bimo", "bim o", "bim u"] },
  { merchant: "Sok", category: "groceries", patterns: ["sok market", "sok "] },
  { merchant: "Carrefour", category: "groceries", patterns: ["carrefour"] },
  { merchant: "Getir", category: "food", patterns: ["getir", "paycell/getir"] },
  { merchant: "Getir Buyuk", category: "groceries", patterns: ["getir buyuk", "getirbuyuk"] },
  { merchant: "Yemeksepeti", category: "food", patterns: ["yemeksepeti"] },
  { merchant: "Tikla Gelsin", category: "food", patterns: ["tikla gelsin", "tıklagelsin"] },
  { merchant: "Trendyol", category: "shopping", patterns: ["trendyol", "s/trendyol", "trendyol.com", "trendyol milla"] },
  { merchant: "Hepsiburada", category: "shopping", patterns: ["hepsiburada"] },
  { merchant: "N11", category: "shopping", patterns: ["n11"] },
  { merchant: "Ciceksepeti", category: "shopping", patterns: ["ciceksepeti", "çiçeksepeti"] },
  { merchant: "LC Waikiki", category: "shopping", patterns: ["lc waikiki", "lcw"] },
  { merchant: "Boyner", category: "shopping", patterns: ["boyner"] },
  { merchant: "Amazon", category: "shopping", patterns: ["amazon"] },
  { merchant: "Obilet", category: "transportation", patterns: ["obilet"] },
  { merchant: "Biletix", category: "entertainment", patterns: ["biletix"] },
  { merchant: "THY", category: "transportation", patterns: ["turkish airlines", "thy"] },
  { merchant: "Pegasus", category: "transportation", patterns: ["pegasus"] },
  { merchant: "Petrol Ofisi", category: "transportation", patterns: ["petrol ofisi", "po/"] },
  { merchant: "Shell", category: "transportation", patterns: ["shell"] },
  { merchant: "Opet", category: "transportation", patterns: ["opet"] },
  { merchant: "BP", category: "transportation", patterns: [" bp ", "bp petrol"] },
  { merchant: "TCDD", category: "transportation", patterns: ["tcdd"] },
  { merchant: "EGO", category: "transportation", patterns: ["ego kart"] },
  { merchant: "Istanbulkart", category: "transportation", patterns: ["istanbulkart", "belbim"] },
  { merchant: "Kentkart", category: "transportation", patterns: ["kentkart"] },
  { merchant: "Starbucks", category: "food", patterns: ["starbucks"] },
  { merchant: "Kahve Dunyasi", category: "food", patterns: ["kahve dunyasi"] },
  { merchant: "Caribou Coffee", category: "food", patterns: ["caribou"] },
  { merchant: "Burger King", category: "food", patterns: ["burger king"] },
  { merchant: "McDonald's", category: "food", patterns: ["mcdonald"] },
  { merchant: "Pizza", category: "food", patterns: ["pizza"] },
  { merchant: "Turk Telekom", category: "bills", patterns: ["tt net", "turk telekom"] },
  { merchant: "Turkcell", category: "bills", patterns: ["turkcell"] },
  { merchant: "Vodafone", category: "bills", patterns: ["vodafone"] },
  { merchant: "Avea", category: "bills", patterns: ["avea"] },
  { merchant: "Enerjisa", category: "bills", patterns: ["enerjisa"] },
  { merchant: "Baskent Dogalgaz", category: "bills", patterns: ["baskent dogalgaz", "başkent doğalgaz"] },
  { merchant: "ASKI", category: "bills", patterns: ["aski su", "aski"] },
  { merchant: "Udemy", category: "education", patterns: ["udemy"] },
  { merchant: "Pharmacy", category: "health", patterns: ["eczane", "eczanesi", "pharmacy"] },
  { merchant: "Card Payment", category: "other", patterns: ["odemetesekkur", "odeme - enpara.com cep", "subehesaptan odeme"] },
];

const CITY_SUFFIXES = [
  "ankara",
  "istanbul",
  "izmir",
  "eskisehir",
  "bayburt",
  "london",
  "luzern",
  "trtr",
  "tr",
];

export function normalizeMerchant(description: string): MerchantNormalization {
  const cleaned = cleanMerchantText(description);
  const normalized = normalizeForMatching(` ${cleaned} `);

  for (const rule of MERCHANT_RULES) {
    const matched = rule.patterns.find((pattern) => normalized.includes(normalizeForMatching(` ${pattern} `).trim()));
    if (matched) {
      return {
        merchant: rule.merchant,
        category: rule.category,
        confidence: 0.96,
        matchedPattern: matched,
      };
    }
  }

  const fallbackMerchant = toDisplayMerchant(cleaned);
  return {
    merchant: fallbackMerchant,
    category: categorize(fallbackMerchant, description),
    confidence: fallbackMerchant === "Transaction" ? 0.2 : 0.58,
  };
}

export function cleanMerchantText(description: string): string {
  const normalizedDescription = removeNoisyTokens(maskSensitiveData(description))
    .replace(/\b\d{2}\s*\/\s*\d{2}\b/g, " ")
    .replace(/\b\d{1,2}\.?\s*tak\b/gi, " ")
    .replace(/\b\d+\s*\.\s*iade\b/gi, " iade ")
    .replace(/\b(?:satis|sat\u0131\u015f)\s+iade\b/gi, " iade ")
    .replace(/\([^)]*(?:taksidi|iadesi|islemin|i\u015flemin)[^)]*\)/gi, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\bP\d{6,}\b/gi, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/[*/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalizedDescription.split(/\s+/);
  while (words.length > 1 && CITY_SUFFIXES.includes(normalizeForMatching(words[words.length - 1]))) {
    words.pop();
  }

  return words.join(" ").trim() || "Transaction";
}

export function normalizeMerchantKey(merchantOrDescription: string): string {
  return normalizeForMatching(cleanMerchantText(merchantOrDescription))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function discoverMerchantRules(transactions: NormalizedTransaction[]): DiscoveredRule[] {
  const counts = new Map<string, { category: string; count: number; patterns: Set<string> }>();

  for (const transaction of transactions) {
    const current = counts.get(transaction.merchant) ?? {
      category: transaction.category,
      count: 0,
      patterns: new Set<string>(),
    };
    current.count += 1;
    current.patterns.add(normalizeForMatching(transaction.merchant));
    counts.set(transaction.merchant, current);
  }

  return Array.from(counts.entries())
    .map(([merchant, value]) => ({
      pattern: Array.from(value.patterns)[0],
      merchant,
      category: value.category,
      transactionCount: value.count,
      confidence: value.count >= 3 ? 0.92 : 0.78,
    }))
    .sort((a, b) => b.transactionCount - a.transactionCount || a.merchant.localeCompare(b.merchant));
}

export function detectRecurringSubscriptions(transactions: NormalizedTransaction[]): RecurringSubscription[] {
  const byMerchant = new Map<string, NormalizedTransaction[]>();

  for (const transaction of transactions) {
    const transactionsForMerchant = byMerchant.get(transaction.merchant) ?? [];
    transactionsForMerchant.push(transaction);
    byMerchant.set(transaction.merchant, transactionsForMerchant);
  }

  const results: RecurringSubscription[] = [];

  for (const [merchant, merchantTransactions] of byMerchant.entries()) {
    const months = [...new Set(merchantTransactions.map((transaction) => transaction.date.slice(0, 7)))].sort();
    const rule = MERCHANT_RULES.find((candidate) => candidate.merchant === merchant);
    const isKnownSubscription = rule?.subscription === true;
    const isSubscriptionCategory = merchantTransactions[0].category === "subscriptions";

    if (months.length >= 2 && (isKnownSubscription || isSubscriptionCategory)) {
      results.push({
        merchant,
        category: merchantTransactions[0].category,
        months,
        medianAmount: median(merchantTransactions.map((transaction) => transaction.amount)),
        confidence: isKnownSubscription ? 0.94 : 0.76,
      });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence || a.merchant.localeCompare(b.merchant));
}

export function detectSalaryTransactions(transactions: NormalizedTransaction[]): SalarySignal[] {
  return transactions
    .filter((transaction) => {
      const normalized = normalizeForMatching(`${transaction.merchant} ${transaction.description}`);
      return (
        transaction.transactionType === "credit" &&
        (normalized.includes("maas") ||
          normalized.includes("salary") ||
          normalized.includes("payroll") ||
          normalized.includes("ucret"))
      );
    })
    .map((transaction) => ({
      merchant: transaction.merchant,
      date: transaction.date,
      amount: transaction.amount,
      confidence: 0.88,
    }));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function toDisplayMerchant(text: string): string {
  const cleaned = text
    .replace(/\b(?:ltd|sti|a\.s\.|anonim|ticaret|sanayi|ve|the)\b/gi, " ")
    .replace(/[^\p{L}\p{N}&'./ -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length === 0) return "Transaction";

  return words
    .map(titleWord)
    .join(" ");
}

function titleWord(word: string): string {
  if (word.length <= 3 && word === word.toUpperCase()) return word;

  const rest = word
    .slice(1)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0307/g, "")
    .normalize("NFC");

  return `${word.charAt(0).toUpperCase()}${rest}`;
}
