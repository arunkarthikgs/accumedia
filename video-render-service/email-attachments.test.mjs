import assert from "node:assert/strict";
import test from "node:test";
import { decodeEmailAttachments } from "./email-attachments.ts";

const attachment = (content = Buffer.from("%PDF-1.4\nflyer").toString("base64"), filename = "nmo-flyer.pdf") => ({
  filename,
  contentType: "application/pdf",
  content,
  encoding: "base64"
});

test("decodes validated PDF attachments into Nodemailer buffers", () => {
  const source = attachment();
  const [decoded] = decodeEmailAttachments([source]);
  assert.equal(decoded.filename, source.filename);
  assert.equal(decoded.contentType, "application/pdf");
  assert.equal(decoded.content.toString(), "%PDF-1.4\nflyer");
});

test("keeps attachment-free messages compatible", () => {
  assert.deepEqual(decodeEmailAttachments(undefined), []);
});

test("rejects invalid MIME types, filenames, encodings, and non-PDF content", () => {
  for (const invalid of [
    { ...attachment(), filename: "../secret.pdf" },
    { ...attachment(), contentType: "text/plain" },
    { ...attachment(), encoding: "utf8" },
    attachment(Buffer.from("not a PDF").toString("base64"))
  ]) {
    assert.throws(() => decodeEmailAttachments([invalid]));
  }
});

test("rejects malformed base64, oversized payloads, and too many attachments", () => {
  assert.throws(() => decodeEmailAttachments([attachment("%%%") ]));
  assert.throws(() => decodeEmailAttachments([attachment(Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(1024 * 1024)]).toString("base64"))]));
  assert.throws(() => decodeEmailAttachments(Array.from({ length: 5 }, (_, index) => attachment(undefined, `flyer-${index}.pdf`))));
});