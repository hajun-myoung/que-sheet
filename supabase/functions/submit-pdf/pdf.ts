import { PDFDocument } from "pdf-lib";
export const MAX_BYTES = 20 * 1024 * 1024;
export async function parsePdf(
  contents: Uint8Array,
  name: string,
  mime: string,
) {
  if (
    !name.toLowerCase().endsWith(".pdf") ||
    name.length > 255 ||
    mime !== "application/pdf" ||
    contents.byteLength < 1 ||
    contents.byteLength > MAX_BYTES
  ) {
    throw Error("20MB 이하 PDF를 제출해 주세요.");
  }
  if (new TextDecoder().decode(contents.slice(0, 5)) !== "%PDF-")
    throw Error("PDF 형식이 아닙니다.");
  try {
    const pdf = await PDFDocument.load(contents, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
    });
    const pages = pdf.getPageCount();
    if (pages < 1 || pages > 500) throw Error("page count");
    pdf.getPages().forEach((page) => page.getSize());
    return pages;
  } catch {
    throw Error(
      "손상되었거나 암호화된 PDF입니다. 1~500페이지 PDF를 제출해 주세요.",
    );
  }
}
