export type EncodedEmailAttachment = {
  filename: string;
  contentType: "application/pdf";
  content: string;
  encoding: "base64";
};

const MAX_ATTACHMENTS = 4;
const MAX_TOTAL_BYTES = 1024 * 1024;
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function decodeEmailAttachments(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw new Error("Invalid email attachments.");

  let totalBytes = 0;
  return value.map((attachment): { filename: string; contentType: string; content: Buffer } => {
    if (!attachment || typeof attachment !== "object") throw new Error("Invalid email attachment.");
    const item = attachment as Partial<EncodedEmailAttachment>;
    if (typeof item.filename !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.pdf$/i.test(item.filename) ||
        item.contentType !== "application/pdf" || item.encoding !== "base64" ||
        typeof item.content !== "string" || !base64Pattern.test(item.content)) {
      throw new Error("Invalid email attachment.");
    }

    const content = Buffer.from(item.content, "base64");
    if (content.toString("base64") !== item.content || content.subarray(0, 5).toString() !== "%PDF-") {
      throw new Error("Invalid email attachment.");
    }
    totalBytes += content.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Email attachments exceed the size limit.");
    return { filename: item.filename, contentType: item.contentType, content };
  });
}