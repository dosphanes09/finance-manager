import { GenericParser } from "./generic-parser";
import { includesAny, normalizeForMatching } from "./text-utils";
import type { BankId, StatementParseResult, StatementParser } from "./types";

export interface TurkishBankProfile {
  bank: Exclude<BankId, "ziraat" | "enpara" | "generic">;
  parserName: string;
  displayName: string;
  keywords: string[];
  layoutKeywords?: string[];
}

export class TurkishBankParser implements StatementParser {
  readonly bank: TurkishBankProfile["bank"];
  readonly name: string;
  private readonly genericParser = new GenericParser();

  constructor(private readonly profile: TurkishBankProfile) {
    this.bank = profile.bank;
    this.name = profile.parserName;
  }

  detect(rawText: string): number {
    const normalized = normalizeForMatching(rawText);
    let score = 0;

    if (includesAny(normalized, this.profile.keywords.map((keyword) => normalizeForMatching(keyword)))) score += 0.55;
    if (includesAny(normalized, ["hesap hareketleri", "hesap ekstresi", "ekstre", "islem tarihi", "aciklama", "tutar"])) score += 0.2;
    if (this.profile.layoutKeywords && includesAny(normalized, this.profile.layoutKeywords.map((keyword) => normalizeForMatching(keyword)))) score += 0.2;

    return Math.min(score, 0.94);
  }

  parse(rawText: string): StatementParseResult {
    const parsed = this.genericParser.parse(rawText);
    const transactions = parsed.transactions.map((transaction) => ({
      ...transaction,
      parser: this.bank,
      confidence: Math.min(0.9, transaction.confidence + 0.04),
      categorizationExplanation:
        transaction.categorizationExplanation ||
        `Parsed by ${this.profile.displayName} profiled parser with deterministic generic table rules.`,
    }));

    return {
      ...parsed,
      bank: this.bank,
      parser: this.name,
      confidence: transactions.length > 0 ? Math.min(0.94, Math.max(parsed.confidence, this.detect(rawText))) : 0,
      transactions,
      warnings: [
        ...parsed.warnings,
        `${this.profile.displayName} was detected by bank profile; transaction rows used generic Turkish statement layout rules.`,
      ],
    };
  }
}
