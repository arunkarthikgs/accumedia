import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export async function extractSourceText(buffer: Buffer, fileName: string, mimeType: string) {
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    const result = await pdfParse(buffer);
    return result.text.trim();
  }

  if (mimeType.includes("wordprocessingml") || /\.docx$/i.test(fileName)) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if (mimeType.startsWith("text/") || /\.(txt|md|csv)$/i.test(fileName)) {
    return buffer.toString("utf8").trim();
  }

  throw new Error("This source type does not have a text extractor configured.");
}
