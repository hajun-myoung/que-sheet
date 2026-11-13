import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { parsePdf, MAX_BYTES } from "../supabase/functions/submit-pdf/pdf";
test("server parser validates bytes, filename, MIME, size, page count and corruption", async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.addPage();
  const bytes = await doc.save();
  assert.equal(await parsePdf(bytes, "발표.pdf", "application/pdf"), 2);
  await assert.rejects(
    () => parsePdf(bytes, "발표.txt", "application/pdf"),
    /20MB/,
  );
  await assert.rejects(() => parsePdf(bytes, "발표.pdf", "text/plain"), /20MB/);
  await assert.rejects(
    () =>
      parsePdf(new Uint8Array(MAX_BYTES + 1), "large.pdf", "application/pdf"),
    /20MB/,
  );
  await assert.rejects(
    () => parsePdf(new Uint8Array(), "empty.pdf", "application/pdf"),
    /20MB/,
  );
  await assert.rejects(
    () =>
      parsePdf(
        new TextEncoder().encode("plain text"),
        "fake.pdf",
        "application/pdf",
      ),
    /형식/,
  );
  await assert.rejects(
    () =>
      parsePdf(
        new TextEncoder().encode("%PDF-corrupted"),
        "bad.pdf",
        "application/pdf",
      ),
    /손상/,
  );
  const many = await PDFDocument.create();
  for (let i = 0; i < 501; i++) many.addPage();
  const manyBytes = await many.save();
  await assert.rejects(
    () => parsePdf(manyBytes, "many.pdf", "application/pdf"),
    /500페이지/,
  );
});
