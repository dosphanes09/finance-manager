import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyFinancialTransaction } from "./transaction-classification";

describe("transaction classification", () => {
  it("classifies credit card payment settlement lines outside income and expenses", () => {
    const result = classifyFinancialTransaction({
      accountType: "credit_card",
      statementType: "credit_card_statement",
      direction: "credit",
      transactionKind: "credit_card_payment",
      merchant: "KREDI KARTI ODEMESI",
      description: "Kredi kartı ödemesi teşekkür ederiz",
      category: "income",
      categorizationSource: "built_in",
    });

    assert.equal(result.type, "credit_card_payment");
    assert.equal(result.direction, "credit");
    assert.equal(result.category, "other");
  });

  it("classifies bank-side card payments as transfers instead of expenses", () => {
    const result = classifyFinancialTransaction({
      accountType: "checking",
      statementType: "bank_account",
      direction: "debit",
      transactionKind: "other",
      merchant: "Kart Ödemesi",
      description: "Ekstre ödemesi borç ödeme",
      category: "bills",
      categorizationSource: "built_in",
    });

    assert.equal(result.type, "credit_card_payment");
    assert.equal(result.direction, "debit");
  });

  it("does not treat every incoming bank transfer as income", () => {
    const result = classifyFinancialTransaction({
      accountType: "checking",
      direction: "credit",
      transactionKind: "fast",
      merchant: "FAST GELEN",
      description: "FAST gelen transfer",
      category: "income",
      categorizationSource: "built_in",
    });

    assert.equal(result.type, "unknown_review");
    assert.equal(result.category, "other");
  });

  it("classifies fees as expenses and ATM movements as review-needed", () => {
    assert.equal(classifyFinancialTransaction({
      accountType: "checking",
      direction: "debit",
      transactionKind: "fee",
      description: "BSMV tahsilati",
      category: "other",
    }).type, "fee");

    assert.equal(classifyFinancialTransaction({
      accountType: "checking",
      direction: "debit",
      transactionKind: "atm_withdrawal",
      description: "ATM para cekme",
      category: "other",
    }).type, "unknown_review");
  });

  it("keeps salary as true income and refunds separate from income", () => {
    assert.equal(classifyFinancialTransaction({
      accountType: "checking",
      direction: "credit",
      transactionKind: "salary",
      description: "Maaş ödemesi",
      category: "other",
    }).type, "income");

    assert.equal(classifyFinancialTransaction({
      accountType: "credit_card",
      direction: "credit",
      transactionKind: "refund",
      description: "POS iade",
      category: "shopping",
    }).type, "refund");
  });
});
