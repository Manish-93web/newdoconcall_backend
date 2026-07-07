const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");
const PDFDocument = require("pdfkit");
const { UPLOAD_ROOT } = require("../../middleware/upload.middleware");

/**
 * Renders a prescription to a PDF on local disk and returns the relative path
 * (module-scoped, matching UploadedFile.path convention: "<module>/<filename>").
 */
function generatePrescriptionPdf({ prescription, doctorName, patientName }) {
  return new Promise((resolve, reject) => {
    const filename = `${uuid()}.pdf`;
    const relativePath = path.join("prescription", filename);
    const fullPath = path.join(UPLOAD_ROOT, "prescription", filename);

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(fullPath);
    doc.pipe(stream);

    doc.fontSize(20).text("DoconCall — e-Prescription", { align: "center" });
    doc.moveDown();
    doc.fontSize(11).text(`Date: ${new Date(prescription.createdAt || Date.now()).toLocaleString()}`);
    doc.text(`Doctor: ${doctorName}`);
    doc.text(`Patient: ${patientName}`);
    doc.moveDown();

    if (prescription.diagnosis?.length) {
      doc.fontSize(13).text("Diagnosis", { underline: true });
      doc.fontSize(11).text(prescription.diagnosis.join(", "));
      doc.moveDown();
    }

    doc.fontSize(13).text("Medicines", { underline: true });
    prescription.medicines.forEach((m, i) => {
      doc.fontSize(11).text(`${i + 1}. ${m.name} — ${m.dosage || ""} — ${m.frequency || ""} — ${m.durationDays ? `${m.durationDays} days` : ""}`);
    });
    doc.moveDown();

    if (prescription.advice) {
      doc.fontSize(13).text("Advice", { underline: true });
      doc.fontSize(11).text(prescription.advice);
      doc.moveDown();
    }

    if (prescription.followUpInstructions) {
      doc.fontSize(13).text("Follow-up", { underline: true });
      doc.fontSize(11).text(prescription.followUpInstructions);
    }

    doc.end();

    stream.on("finish", () =>
      resolve({ relativePath, mimetype: "application/pdf", size: fs.statSync(fullPath).size })
    );
    stream.on("error", reject);
  });
}

module.exports = { generatePrescriptionPdf };
