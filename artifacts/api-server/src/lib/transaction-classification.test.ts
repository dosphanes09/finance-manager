import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyFinancialTransaction } from "./transaction-classification";

describe("transaction classification", () => {
  it("classifies credit card payments as transfers instead of income", () => {
    const result = classifyFinancialTransaction({
      accountType: "credit_card",
      direction: "credit",
      transactionKind: "credit_card_payment",
      merchant: "KREDI KARTI ODEMESI",
      description: "Kredi kartı ödemesi teşekkür ederiz",
      category: "income",
      categorizationSource: "built_in",
    });

    assert.equal(result.type, "transfer");
    assert.equal(result.direction, "credit");
    assert.equal(result.category, "other");
  });

  it("classifies bank-side card payments as transfers instead of expenses", () => {
    const result = classifyFinancialTransaction({
      accountType: "checking",
      direction: "debit",
      transactionKind: "other",
      merchant: "Kart Ödemesi",
      description: "Ekstre ödemesi borç ödeme",
      category: "bills",
      categorizationSource: "built_in",
    });

    assert.equal(result.type, "transfer");
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

    assert.equal(result.type, "transfer");
    assert.equal(result.category, "other");
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
