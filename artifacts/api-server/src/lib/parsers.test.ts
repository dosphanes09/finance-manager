import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseCsv, parseExcel, parsePdfText, StatementParseError } from "./parsers";
import { detectBank, normalizeMerchant } from "./statement-parsers";
import { inferTransactionKind } from "./statement-parsers/text-utils";

describe("parsePdfText", () => {
  it("parses Turkish date, amount, and balance columns", () => {
    const rows = parsePdfText(`
      Hesap Hareketleri
      Islem Tarihi Aciklama Borc Alacak Bakiye
      01.06.2026 MARKET ALISVERIS 250,75 12.500,00
      02.06.2026 MAAS ODEMESI 25.000,00 37.500,00
    `);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].date, "2026-06-01");
    assert.equal(rows[0].merchant, "Market Alisveris");
    assert.equal(rows[0].description, "MARKET ALISVERIS");
    assert.equal(rows[0].amount, 250.75);
    assert.equal(rows[0].type, "debit");
    assert.equal(rows[0].currency, "TRY");
    assert.equal(rows[0].transactionType, "debit");
    assert.equal(rows[0].balance, 12500);
    assert.equal(rows[1].date, "2026-06-02");
    assert.equal(rows[1].amount, 25000);
    assert.equal(rows[1].type, "credit");
  });

  it("groups multi-line descriptions before selecting amount and balance", () => {
    const rows = parsePdfText(`
      01/06/2026
      TRENDYOL PAZARYERI
      SIPARIS NO 1234567890
      -1.250,75 TL
      8.749,25 TL
    `);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].date, "2026-06-01");
    assert.equal(rows[0].merchant, "Trendyol");
    assert.equal(rows[0].description, "TRENDYOL PAZARYERI SIPARIS NO");
    assert.equal(rows[0].amount, 1250.75);
    assert.equal(rows[0].type, "credit");
  });

  it("uses debit and credit columns before the balance column", () => {
    const rows = parsePdfText(`
      Tarih Aciklama Borc Alacak Bakiye
      2026-06-03 FAST EFT GELEN TRANSFER 0,00 2.000,00 10.749,25
      2026-06-04 KART HARCAMA 125.50 0,00 10.623,75
    `);

    assert.equal(rows.length, 2);
    assert.equal(rows[0].amount, 2000);
    assert.equal(rows[0].type, "credit");
    assert.equal(rows[0].transactionKind, "fast");
    assert.equal(rows[1].amount, 125.5);
    assert.equal(rows[1].type, "debit");
  });

  it("parses Enpara credit card statement rows without metadata or footer", () => {
    const rows = parsePdfText(`
      Enpara Bank A.S.
      Kredi Karti Ekstresi
      Ekstre tarihi 12/06/2026
      Ekstre borcu -340,84 TL
      Minimum odeme tutari 0,00 TL
      Son odeme tarihi 22/06/2026
      Islem tarihi Aciklama Taksit Tutar
      Bir onceki ekstre bakiyeniz 3.326,34 TL
      21/05/2026 Odeme - Enpara.com Cep Subesi - 3.326,34 TL
      05/06/2026 Odeme - Enpara.com Cep Subesi - 2.430,38 TL
      15/05/2026 Spotify 55,00 TL
      16/03/2026 TRENDYOL.COM ISTANBUL TR (2.199,99 TL) 3/3 733,30 TL
      25/05/2026 OPENAI (6,00 USD) 280,37 TL
      28/05/2026 IYZICO/AmazonPrimeTR ISTANBUL TR 69,90 TL
      29/05/2026 PAYCELL/GETIR2 353,99 TL
      29/05/2026 GOOGLE *YouTubePremium 52,99 TL
      31/05/2026 Netflix.com 289,99 TL
      01/06/2026 PIZZA RESTAURANTLARI 100,00 TL
      05/06/2026 BIM U650 TANDOGAN CANKAYA 154,00 TL
      Bir sonraki ekstrenizin tarihi 12/07/2026, son odeme tarihi ise 22/07/2026'dir.
      Sayfa 1 / 2
    `);

    assert.equal(rows.length, 11);
    assert.equal(rows[0].merchant, "Card Payment");
    assert.equal(rows[0].amount, 3326.34);
    assert.equal(rows[0].transactionType, "credit");
    assert.equal(rows[0].transactionKind, "credit_card_payment");
    assert.equal(rows[3].merchant, "Trendyol");
    assert.equal(rows[3].amount, 733.3);
    assert.equal(rows[4].merchant, "OpenAI");
    assert.equal(rows[4].amount, 280.37);
    assert.equal(rows[6].merchant, "Getir");
    assert.equal(rows[6].amount, 353.99);
    assert.equal(rows[10].merchant, "Bim");
  });

  it("parses Ziraat Bankkart rows from the transaction table only", () => {
    const rows = parsePdfText(`
      Ziraat Bankasi Bankkart
      Hesap Kesim Tarihi : 02.06.2026 Nakit Avans Limiti : 4.000,00 TL
      Son Odeme Tarihi : 12.06.2026 Kullanilabilir Nakit Avans Limiti : 11,04 TL
      Donem Borcu TL : 15.935,53 TL Sonraki Hesap Kesim Tarihi : 02.07.2026
      Islem Tarihi Islem Aciklamasi TL Tutar USD Tutar Bankkart Lira
      04.05.2026 0809 subehesaptan odemetesekkur ederiz 3.097,15+
      04.05.2026 EGO KART SANAL ANKARA 450,00 0,00
      29.05.2026 29/03 S/TRENDYOL 03.Tak ISTANBUL (1209.00 TL Islemin 3/3 Taksidi) 403,00
      Devreden Bakiye Harcamalariniz Faiz Ucretler ve
    `);

    assert.equal(rows.length, 3);
    assert.equal(rows[0].merchant, "Card Payment");
    assert.equal(rows[0].amount, 3097.15);
    assert.equal(rows[0].transactionType, "credit");
    assert.equal(rows[1].merchant, "EGO");
    assert.equal(rows[1].amount, 450);
    assert.equal(rows[2].merchant, "Trendyol");
    assert.equal(rows[2].amount, 403);
  });

  it("normalizes common Turkish merchants deterministically", () => {
    assert.equal(normalizeMerchant("MIGROS TICARET A.S.").merchant, "Migros");
    assert.equal(normalizeMerchant("MIGROS SANAL").merchant, "Migros");
    assert.equal(normalizeMerchant("A101 NECATIBEY").merchant, "A101");
    assert.equal(normalizeMerchant("BIM U650 TANDOGAN").merchant, "Bim");
    assert.equal(normalizeMerchant("IYZICO/AmazonPrimeTR ISTANBUL TR").merchant, "Amazon Prime");
    assert.equal(normalizeMerchant("GOOGLE *YouTubePremium").merchant, "YouTube Premium");
  });

  it("detects supported Turkish bank profiles before generic parsing", () => {
    assert.equal(detectBank("Garanti BBVA Hesap Hareketleri Islem Tarihi Aciklama Borc Alacak Bakiye").bank, "garanti");
    assert.equal(detectBank("Akbank Axess Kredi Karti Ekstresi Islem Tarihi Aciklama Tutar").bank, "akbank");
    assert.equal(detectBank("Turkiye Is Bankasi Maximum Hesap Ekstresi Islem Tarihi Aciklama Tutar").bank, "isbank");
    assert.equal(detectBank("Kuveyt Turk Saglam Kart Hesap Hareketleri Islem Tarihi Aciklama Tutar").bank, "kuveytturk");
  });

  it("infers Turkish transaction kinds deterministically", () => {
    assert.equal(inferTransactionKind("FAST GELEN TRANSFER", "Sender", "credit"), "fast");
    assert.equal(inferTransactionKind("ATM PARA CEKME", "ATM", "debit"), "atm_withdrawal");
    assert.equal(inferTransactionKind("ATM PARA YATIRMA", "ATM", "credit"), "atm_deposit");
    assert.equal(inferTransactionKind("MAAS ODEMESI", "Employer", "credit"), "salary");
    assert.equal(inferTransactionKind("SPOTIFY PREMIUM", "Spotify", "debit"), "subscription");
  });

  it("detects salary credits from structured CSV descriptions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "financeanalyzerpro-csv-"));
    const filePath = path.join(dir, "statement.csv");

    try {
      await fs.writeFile(
        filePath,
        [
          "Date,Description,Amount",
          '2026-06-02,FAST GELEN TRANSFER MAAS ODEMESI,"25.000,00 TL"',
        ].join("\n"),
        "utf-8",
      );

      const rows = await parseCsv(filePath);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].amount, 25000);
      assert.equal(rows[0].type, "credit");
      assert.equal(rows[0].transactionKind, "salary");
      assert.equal(rows[0].category, "income");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("defaults Excel imports without a currency column to TRY", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "financeanalyzerpro-xlsx-"));
    const filePath = path.join(dir, "statement.xlsx");

    try {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet([
        {
          Date: "2026-06-01",
          Description: "MIGROS TICARET A.S.",
          Amount: "1250.50",
        },
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
      await fs.writeFile(filePath, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

      const rows = await parseExcel(filePath);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].amount, 1250.5);
      assert.equal(rows[0].currency, "TRY");
      assert.equal(rows[0].merchant, "Migros");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("throws diagnostics when text is extracted but no rows match", () => {
    assert.throws(
      () => parsePdfText(`
        Hesap Ozeti
        01.06.2026 - 30.06.2026
        Toplam Bakiye 1.250,75 TL
      `),
      (err) => {
        assert.ok(err instanceof StatementParseError);
        assert.equal(err.details.textExtractedSuccessfully, true);
        assert.ok(err.details.possibleDateLines.length > 0);
        assert.ok(err.details.possibleAmountLines.length > 0);
        assert.match(err.message, /no transaction rows matched/i);
        return true;
      },
    );
  });
});
