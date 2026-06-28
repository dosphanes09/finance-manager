import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATEGORIES,
  getCategoryLabel,
  normalizeCategoryId,
} from "@workspace/finance-categories";

describe("category normalization", () => {
  it("normalizes legacy labels and aliases into canonical category ids", () => {
    assert.equal(normalizeCategoryId("Food & Dining"), "food");
    assert.equal(normalizeCategoryId("food_dining"), "food");
    assert.equal(normalizeCategoryId("dining"), "food");
    assert.equal(normalizeCategoryId("Bills & Utilities"), "bills");
    assert.equal(normalizeCategoryId("Health & Fitness"), "health");
    assert.equal(normalizeCategoryId("Rent & Housing"), "rent");
  });

  it("normalizes unknown invalid categories to other for cleanup", () => {
    assert.equal(normalizeCategoryId("Unmapped Legacy Label"), "other");
    assert.equal(normalizeCategoryId(""), "other");
    assert.equal(normalizeCategoryId(null), "other");
  });

  it("keeps dropdown values as canonical ids while displaying labels", () => {
    const food = CATEGORIES.find((category) => category.label === "Food & Dining");

    assert.equal(food?.id, "food");
    assert.equal(getCategoryLabel("food"), "Food & Dining");
    assert.equal(normalizeCategoryId(food?.id), "food");
  });
});
