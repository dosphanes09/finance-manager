import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatUploadDbDevError,
  getUploadDbErrorDiagnostic,
  isDatabaseConnectionError,
} from "./upload-db-errors";

describe("upload database error handling", () => {
  it("does not classify schema/query failures as connection failures", () => {
    const cause = Object.assign(new Error('relation "merchants" does not exist'), {
      code: "42P01",
      table: "merchants",
    });
    const err = new Error("Failed query: select from merchants params: []") as Error & { cause?: unknown };
    err.cause = cause;

    assert.equal(isDatabaseConnectionError(err), false);

    const diagnostic = getUploadDbErrorDiagnostic(err);
    assert.equal(diagnostic.code, "42P01");
    assert.equal(diagnostic.table, "merchants");
    assert.equal(diagnostic.message, 'relation "merchants" does not exist');
  });

  it("classifies refused connections as connection failures", () => {
    const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    const err = new Error("Database query failed") as Error & { cause?: unknown };
    err.cause = cause;

    assert.equal(isDatabaseConnectionError(err), true);
  });

  it("redacts query params and passwords in diagnostics", () => {
    const diagnostic = getUploadDbErrorDiagnostic(
      new Error(
        "Failed query: insert into transactions values (...) params: postgresql://postgres:secret@localhost:5432/fintrack, CARD 4111111111111111",
      ),
    );

    assert.equal(diagnostic.message.includes("secret"), false);
    assert.equal(diagnostic.message.includes("4111111111111111"), false);
    assert.equal(diagnostic.message.includes("params:<redacted>"), true);
  });

  it("formats development diagnostics with code and table", () => {
    const cause = Object.assign(new Error('relation "merchants" does not exist'), {
      code: "42P01",
      table: "merchants",
    });
    const err = new Error("Failed query") as Error & { cause?: unknown };
    err.cause = cause;

    assert.equal(
      formatUploadDbDevError("Merchant memory database diagnostic:", err),
      'Merchant memory database diagnostic: code=42P01 relation "merchants" does not exist table=merchants',
    );
  });
});
