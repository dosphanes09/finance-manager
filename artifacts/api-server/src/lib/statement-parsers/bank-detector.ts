import { EnparaParser } from "./enpara-parser";
import { GenericParser } from "./generic-parser";
import { TurkishBankParser, type TurkishBankProfile } from "./turkish-bank-parser";
import { ZiraatParser } from "./ziraat-parser";
import type { BankId, StatementParser } from "./types";

export interface BankDetectionResult {
  bank: BankId;
  confidence: number;
  parser: StatementParser;
  candidates: Array<{ bank: BankId; confidence: number; parser: string }>;
}

const TURKISH_BANK_PROFILES: TurkishBankProfile[] = [
  {
    bank: "isbank",
    parserName: "IsBankasiParser",
    displayName: "Is Bankasi",
    keywords: ["is bankasi", "turkiye is bankasi", "maximum"],
    layoutKeywords: ["hesap hareketleri", "ekstre", "islem tarihi", "aciklama", "tutar", "bakiye"],
  },
  {
    bank: "garanti",
    parserName: "GarantiParser",
    displayName: "Garanti BBVA",
    keywords: ["garanti", "garanti bbva", "bonus"],
    layoutKeywords: ["hesap hareketleri", "islem tarihi", "aciklama", "borc", "alacak", "bakiye"],
  },
  {
    bank: "akbank",
    parserName: "AkbankParser",
    displayName: "Akbank",
    keywords: ["akbank", "axess"],
    layoutKeywords: ["hesap hareketleri", "islem tarihi", "aciklama", "tutar", "bakiye"],
  },
  {
    bank: "yapikredi",
    parserName: "YapiKrediParser",
    displayName: "Yapi Kredi",
    keywords: ["yapi kredi", "yapikredi", "worldcard"],
    layoutKeywords: ["hesap hareketleri", "islem tarihi", "aciklama", "tutar", "bakiye"],
  },
  {
    bank: "qnb",
    parserName: "QnbParser",
    displayName: "QNB",
    keywords: ["qnb", "finansbank", "cardfinans"],
    layoutKeywords: ["hesap hareketleri", "islem tarihi", "aciklama", "borc", "alacak"],
  },
  {
    bank: "vakifbank",
    parserName: "VakifBankParser",
    displayName: "VakifBank",
    keywords: ["vakifbank", "vakif bank", "world"],
    layoutKeywords: ["hesap hareketleri", "islem tarihi", "aciklama", "tutar", "bakiye"],
  },
  {
    bank: "halkbank",
    parserName: "HalkbankParser",
    displayName: "Halkbank",
    keywords: ["halkbank", "halk bank", "paraf"],
    layoutKeywords: ["hesap hareketleri", "islem tarihi", "aciklama", "tutar", "bakiye"],
  },
  {
    bank: "kuveytturk",
    parserName: "KuveytTurkParser",
    displayName: "Kuveyt Turk",
    keywords: ["kuveyt turk", "kuveytturk", "saglam kart"],
    layoutKeywords: ["hesap hareketleri", "islem tarihi", "aciklama", "tutar", "bakiye"],
  },
];

const PARSERS: StatementParser[] = [
  new ZiraatParser(),
  new EnparaParser(),
  ...TURKISH_BANK_PROFILES.map((profile) => new TurkishBankParser(profile)),
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
