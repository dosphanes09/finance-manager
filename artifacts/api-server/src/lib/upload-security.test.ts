import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, it } from "node:test";
import { maskSensitiveData } from "./statement-parsers/text-utils";
import {
  sanitizeStoredText,
  UploadValidationError,
  validateUploadContent,
  validateUploadMetadata,
} from "./upload-security";

describe("upload security", () => {
  it("requires a supported extension and matching MIME type", () => {
    assert.equal(
      validateUploadMetadata({
        originalname: "statement.pdf",
        mimetype: "application/pdf",
      }),
      ".pdf",
    );

    assert.throws(
      () => validateUploadMetadata({
        originalname: "statement.pdf",
        mimetype: "text/plain",
      }),
      UploadValidationError,
    );

    assert.throws(
      () => validateUploadMetadata({
        originalname: "statement.exe",
        mimetype: "application/octet-stream",
      }),
      UploadValidationError,
    );
  });

  it("validates file signatures before parser execution", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-upload-test-"));
    try {
      const pdfPath = path.join(dir, "statement.pdf");
      const xlsxPath = path.join(dir, "statement.xlsx");
      const xlsPath = path.join(dir, "statement.xls");
      const fakePdfPath = path.join(dir, "fake.pdf");

      await fs.writeFile(pdfPath, Buffer.from("%PDF-1.7\n", "ascii"));
      await fs.writeFile(xlsxPath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));
      await fs.writeFile(xlsPath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
      await fs.writeFile(fakePdfPath, Buffer.from("not a pdf", "utf8"));

      await assert.doesNotReject(validateUploadContent(pdfPath, ".pdf"));
      await assert.doesNotReject(validateUploadContent(xlsxPath, ".xlsx"));
      await assert.doesNotReject(validateUploadContent(xlsPath, ".xls"));
      await assert.rejects(validateUploadContent(fakePdfPath, ".pdf"), UploadValidationError);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects binary data masquerading as CSV", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finance-upload-test-"));
    try {
      const csvPath = path.join(dir, "statement.csv");
      const binaryPath = path.join(dir, "statement.csv");

      await fs.writeFile(csvPath, "Date,Description,Amount\n2026-06-01,MIGROS,250.75\n");
      await assert.doesNotReject(validateUploadContent(csvPath, ".csv"));

      await fs.writeFile(binaryPath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
      await assert.rejects(validateUploadContent(binaryPath, ".csv"), UploadValidationError);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("masks sensitive financial identifiers before storage or diagnostics", () => {
    const raw = "IBAN: TR330006100519786457841326 card 4111 1111 1111 1111 ref 1234567890";
    const masked = sanitizeStoredText(raw);

    assert.equal(masked.includes("TR330006100519786457841326"), false);
    assert.equal(masked.includes("4111 1111 1111 1111"), false);
    assert.equal(masked.includes("1234567890"), false);
    assert.equal(maskSensitiveData(raw), masked);
  });
});
