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

  it("parses Enpara credit card statement rows without metadata or footer", () => {
    const rows = parsePdfText(`
      Ekstre tarihi 12/06/2026
      Ekstre borcu -340,84 TL
      Minimum ödeme tutarı 0,00 TL
      Son ödeme tarihi 22/06/2026
      Ad soyad Test User
      Kart numarası 5269 11** **** 8994
      Kart limiti 7.500,00 TL
      Kullanılabilir kart limiti 7.840,84 TL
      3.326,34 TL 5.756,72 TL 2.089,54 TL 0,00 TL 0,00 TL -340,84 TL
      İşlem tarihi Açıklama Taksit Tutar
      Bir önceki ekstre bakiyeniz 3.326,34 TL
      21/05/2026 Ödeme - Enpara.com Cep Şubesi - 3.326,34 TL
      05/06/2026 Ödeme - Enpara.com Cep Şubesi - 2.430,38 TL
      15/05/2026 Spotify 55,00 TL
      16/03/2026 TRENDYOL.COM ISTANBUL TR (2.199,99 TL) 3/3 733,30 TL
      25/05/2026 OPENAI (6,00 USD) 280,37 TL
      28/05/2026 IYZICO/AmazonPrimeTR ISTANBUL TR 69,90 TL
      29/05/2026 PAYCELL/GETIR2 353,99 TL
      29/05/2026 GOOGLE *YouTubePremium 52,99 TL
      31/05/2026 Netflix.com 289,99 TL
      01/06/2026 PİZZA RESTAURANTLARI 100,00 TL
      05/06/2026 BIM U650 TANDOGAN CANKAYA 154,00 TL
      Bir sonraki ekstrenizin tarihi 12/07/2026, son ödeme tarihi ise 22/07/2026'dır.
      Güncel akdi faiz ve gecikme faizlerinin aylık/yıllık değerleri aşağıdadır.
      Sayfa 1 / 2
    `);

    assert.equal(rows.length, 11);
    assert.equal(rows[0].merchant, "Ödeme - Enpara.com Cep");
    assert.equal(rows[0].amount, 3326.34);
    assert.equal(rows[3].merchant, "TRENDYOL.COM ISTANBUL TR");
    assert.equal(rows[3].amount, 733.3);
    assert.equal(rows[4].merchant, "OPENAI");
    assert.equal(rows[4].amount, 280.37);
    assert.equal(rows[6].merchant, "PAYCELL/GETIR2");
    assert.equal(rows[6].amount, 353.99);
    assert.equal(rows[10].description, "BIM U650 TANDOGAN CANKAYA");
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
