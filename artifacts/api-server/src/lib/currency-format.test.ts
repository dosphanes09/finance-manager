import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCurrency } from "@workspace/finance-format";

describe("currency formatting", () => {
  it("formats Turkish Lira with Turkish locale by default", () => {
    assert.equal(formatCurrency(1250.5), "\u20ba1.250,50");
    assert.equal(formatCurrency(-349.9), "-\u20ba349,90");
  });

  it("does not use dollar signs for dashboard totals by default", () => {
    assert.equal(formatCurrency(25000).includes("$"), false);
    assert.equal(formatCurrency(25000).includes("\u20ba"), true);
  });
});
