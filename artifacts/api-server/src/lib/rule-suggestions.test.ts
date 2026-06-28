import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categorize } from "./categorizer";
import {
  buildRuleSuggestions,
  categorizeTransactionsWithRules,
  type TransactionForRuleAnalysis,
} from "./rule-suggestions";

const transactions: TransactionForRuleAnalysis[] = [
  {
    id: 1,
    merchant: "MIGROS TICARET A.S.",
    description: "MIGROS TICARET A.S. ISTANBUL",
    amount: "125.50",
    category: "other",
  },
  {
    id: 2,
    merchant: "MIGROS SANAL",
    description: "MIGROS SANAL MARKET",
    amount: "89.90",
    category: "other",
  },
  {
    id: 3,
    merchant: "Obilet",
    description: "OBILET BUS TICKET",
    amount: "420.00",
    category: "shopping",
  },
  {
    id: 4,
    merchant: "Spotify",
    description: "SPOTIFY PREMIUM",
    amount: "59.99",
    category: "other",
  },
];

describe("rule suggestions", () => {
  it("suggests deterministic rules for Other and mismatched transactions", () => {
    const suggestions = buildRuleSuggestions(transactions, []);

    const migros = suggestions.find((suggestion) => suggestion.merchant === "Migros");
    assert.equal(migros?.pattern, "migros");
    assert.equal(migros?.category, "groceries");
    assert.equal(migros?.transactionCount, 2);

    const obilet = suggestions.find((suggestion) => suggestion.merchant === "Obilet");
    assert.equal(obilet?.category, "transportation");
    assert.match(obilet?.reason ?? "", /deterministic rules suggest transportation/);

    const spotify = suggestions.find((suggestion) => suggestion.merchant === "Spotify");
    assert.equal(spotify?.category, "subscriptions");
  });

  it("does not suggest merchants already covered by custom rules", () => {
    const suggestions = buildRuleSuggestions(transactions, [
      { pattern: "migros", category: "groceries" },
      { pattern: "spotify", category: "subscriptions" },
    ]);

    assert.equal(suggestions.some((suggestion) => suggestion.merchant === "Migros"), false);
    assert.equal(suggestions.some((suggestion) => suggestion.merchant === "Spotify"), false);
  });

  it("recategorizes existing transactions with custom rules before built-ins", () => {
    const updates = categorizeTransactionsWithRules(
      [
        {
          id: 10,
          merchant: "Steam",
          description: "STEAM GAMES",
          amount: "20.00",
          category: "entertainment",
        },
      ],
      [{ pattern: "steam", category: "subscriptions" }],
    );

    assert.deepEqual(updates, [{ id: 10, category: "subscriptions" }]);
  });

  it("matches custom rules across Turkish uppercase variants", () => {
    assert.equal(
      categorize("M\u0130GROS", "M\u0130GROS SANAL", [{ pattern: "migros", category: "groceries" }]),
      "groceries",
    );
  });
});
