import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePdfText, StatementParseError } from "./parsers";

describe("parsePdfText", () => {
  it("parses Turkish date, amount, and balance columns", () => {
    const rows = parsePdfText(`
      Hesap Hareketleri
      Islem Tarihi Aciklama Borc Alacak Bakiye
      01.06.2026 MARKET ALISVERIS 250,75 12.500,00
      02.06.2026 MAAS ODEMESI 25.000,00 37.500,00
    `);

    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      date: "2026-06-01",
      merchant: "MARKET ALISVERIS",
      description: "MARKET ALISVERIS",
      amount: 250.75,
      type: "debit",
    });
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
    assert.equal(rows[0].merchant, "TRENDYOL PAZARYERI SIPARIS NO");
    assert.equal(rows[0].description, "TRENDYOL PAZARYERI SIPARIS NO 1234****");
    assert.equal(rows[0].amount, 1250.75);
    assert.equal(rows[0].type, "debit");
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
    assert.equal(rows[1].amount, 125.5);
    assert.equal(rows[1].type, "debit");
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
