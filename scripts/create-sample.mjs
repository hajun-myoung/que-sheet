import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "node:fs";
const pdf = await PDFDocument.create();
const regular = await pdf.embedFont(StandardFonts.Helvetica),
  bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const color = (hex) =>
  rgb(...hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255));
const ink = color("29232D"),
  cream = color("F8F4F6"),
  brand = color("A50034"),
  muted = color("87747F");
const titles = [
  "Small ideas.\nBrighter futures.",
  "A meaningful problem.",
  "Designed around you.",
  "From possibility\nto everyday impact.",
  "Growing, together.",
  "The next chapter\nstarts here.",
];
for (let i = 0; i < 6; i++) {
  const p = pdf.addPage([960, 540]);
  p.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color: cream });
  p.drawText("L U M I N O U S", {
    x: 49,
    y: 488,
    size: 11,
    font: bold,
    color: ink,
  });
  p.drawText("2026  /  IMPACT DEMO DAY", {
    x: 710,
    y: 488,
    size: 9,
    font: regular,
    color: muted,
  });
  p.drawText(
    i === 0 ? "MAKE ROOM FOR WHAT\nCOMES NEXT." : `CHAPTER 0${i + 1}`,
    { x: 50, y: 405, size: 10, lineHeight: 15, font: bold, color: brand },
  );
  p.drawText(titles[i], {
    x: 48,
    y: 307,
    size: 48,
    lineHeight: 57,
    font: bold,
    color: ink,
  });
  p.drawText(
    [
      "A thoughtful AI companion for a more inspired everyday.",
      "Less friction. More time for the things that matter.",
      "Simple interactions. Personal experiences. Lasting value.",
      "Built with purpose. Tested with real people.",
      "One shared vision. A world of new possibilities.",
      "Thank you for being part of our journey.",
    ][i],
    { x: 51, y: 164, size: 11, font: regular, color: muted },
  );
  p.drawRectangle({ x: 51, y: 119, width: 35, height: 2, color: brand });
  p.drawText("TEAM LUMINOUS", {
    x: 101,
    y: 117,
    size: 9,
    font: bold,
    color: ink,
  });
  // Original vector motif: interlocking crimson sheets.
  for (let j = 4; j >= 0; j--) {
    p.drawEllipse({
      x: 727 + j * 13,
      y: 260 + j * 3,
      xScale: 98,
      yScale: 135,
      color: color(["EBD6E0", "E3C0D1", "D79CB6", "BB557D", "A50034"][4 - j]),
      rotate: { type: "degrees", angle: -28 + j * 13 },
    });
  }
  p.drawEllipse({
    x: 735,
    y: 265,
    xScale: 28,
    yScale: 46,
    color: cream,
    rotate: { type: "degrees", angle: 20 },
  });
  p.drawLine({
    start: { x: 49, y: 57 },
    end: { x: 911, y: 57 },
    thickness: 0.5,
    color: color("DDD0D7"),
  });
  p.drawText("A BETTER EVERYDAY, ONE BRIGHT IDEA AT A TIME.", {
    x: 50,
    y: 33,
    size: 7,
    font: regular,
    color: muted,
  });
  p.drawText(`${String(i + 1).padStart(2, "0")} / 06`, {
    x: 870,
    y: 33,
    size: 8,
    font: regular,
    color: muted,
  });
}
writeFileSync("public/sample.pdf", await pdf.save());
