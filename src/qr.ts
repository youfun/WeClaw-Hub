import qrcode from "qrcode-generator";

const QR_MARGIN = 1;
const QR_SIZE = 260;

export function renderQrSvg(content: string): string {
  const qr = qrcode(0, "M");
  qr.addData(content, "Byte");
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = Math.max(Math.floor(QR_SIZE / (moduleCount + QR_MARGIN * 2)), 4);

  return qr.createSvgTag({
    cellSize,
    margin: QR_MARGIN,
    scalable: true,
  });
}