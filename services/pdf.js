const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generateInvoicePDF(invoice, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(filePath));
    doc.fontSize(20).text('Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Invoice ID: ${invoice.id}`);
    doc.text(`Customer: ${invoice.customer_email}`);
    doc.text(`Amount: $${invoice.amount}`);
    doc.text(`Status: ${invoice.status}`);
    doc.text(`Description: ${invoice.description}`);
    doc.end();
    doc.on('finish', resolve);
    doc.on('error', reject);
  });
}

module.exports = { generateInvoicePDF };