const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const LOGO_PATHS = {
  stripe: path.join(__dirname, '../assets/logos/stripe.png'),
  paypal: path.join(__dirname, '../assets/logos/paypal.png'),
  square: path.join(__dirname, '../assets/logos/square.png')
};

// Helper to draw a table row
function drawTableRow(doc, y, row, widths) {
  let x = doc.page.margins.left;
  row.forEach((cell, i) => {
    doc.text(cell, x + 2, y + 2, { width: widths[i] - 4, align: 'left' });
    x += widths[i];
  });
}

async function generateInvoicePDF(invoice, filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // --- Company Info & Logo ---
    const platform = (invoice.platform || '').toLowerCase();
    const logoPath = LOGO_PATHS[platform];
    if (logoPath && fs.existsSync(logoPath)) {
      doc.image(logoPath, doc.page.width - 120, 30, { width: 80 });
    }
    doc.fontSize(18).text('Your Company Name', 40, 40);
    doc.fontSize(10).text('123 Main St, City, Country', 40, 62);
    doc.text('support@yourcompany.com', 40, 75);
    doc.moveDown(2);

    // --- Invoice Title & Meta ---
    doc.fontSize(24).text('INVOICE', { align: 'left' });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Invoice #: ${invoice.id || invoice.transaction_id || ''}`);
    doc.text(`Date: ${invoice.created_at || new Date().toLocaleString()}`);
    doc.text(`Platform: ${invoice.platform || 'N/A'}`);
    doc.moveDown();

    // --- Customer Info ---
    doc.fontSize(12).text('Bill To:', { underline: true });
    doc.text(invoice.customer_name || '');
    doc.text(invoice.customer_email || '');
    if (invoice.customer_address) doc.text(invoice.customer_address);
    doc.moveDown();

    // --- Itemized Table ---
    doc.fontSize(12).text('Items:', { underline: true });
    const items = invoice.items && invoice.items.length
      ? invoice.items
      : [{ name: invoice.description || 'Service', quantity: 1, price: invoice.amount }];
    // Table header
    const tableTop = doc.y + 5;
    const colWidths = [220, 80, 80, 80];
    doc.rect(doc.page.margins.left, tableTop, colWidths.reduce((a, b) => a + b), 22).fillAndStroke('#f0f0f0', '#000');
    drawTableRow(doc, tableTop, ['Item', 'Quantity', 'Unit Price', 'Total'], colWidths);
    doc.moveDown();
    // Table rows
    let y = tableTop + 22;
    items.forEach(item => {
      doc.rect(doc.page.margins.left, y, colWidths.reduce((a, b) => a + b), 20).stroke();
      drawTableRow(doc, y, [
        item.name,
        String(item.quantity || 1),
        `$${Number(item.price).toFixed(2)}`,
        `$${(Number(item.price) * (item.quantity || 1)).toFixed(2)}`
      ], colWidths);
      y += 20;
    });

    // --- Payment Summary ---
    const total = items.reduce((sum, item) => sum + Number(item.price) * (item.quantity || 1), 0);
    doc.moveDown(2);
    doc.fontSize(14).text(`Total: $${total.toFixed(2)}`, { align: 'right' });
    if (invoice.currency) doc.fontSize(10).text(`Currency: ${invoice.currency}`, { align: 'right' });
    if (invoice.status) doc.fontSize(10).text(`Status: ${invoice.status}`, { align: 'right' });

    // --- QR Code for Payment (optional) ---
    if (invoice.payment_url) {
      doc.moveDown(2);
      doc.fontSize(12).text('Scan to pay:', { align: 'left' });
      const qrDataUrl = await QRCode.toDataURL(invoice.payment_url, { errorCorrectionLevel: 'H' });
      doc.image(qrDataUrl, { fit: [100, 100], align: 'center' });
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

module.exports = { generateInvoicePDF };