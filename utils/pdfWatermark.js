export function addMagizhWatermark(doc) {
  const watermark = new doc.GState({ opacity: 0.08 });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.saveGraphicsState();
    doc.setGState(watermark);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(56);
    doc.setTextColor(39, 121, 93);
    doc.text("Magizh", doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() / 2, {
      align: "center",
      baseline: "middle",
    });
    doc.restoreGraphicsState();
  }
}
