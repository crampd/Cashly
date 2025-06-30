const express = require('express');
const bodyParser = require('body-parser');
const { saveInvoice } = require('../db');
const { SQUARE_WEBHOOK_SIGNATURE_KEY } = require('../config');
const crypto = require('crypto');

function verifySquareSignature(req) {
  const signature = req.headers['x-square-signature'];
  const body = JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha1', SQUARE_WEBHOOK_SIGNATURE_KEY);
  hmac.update(body);
  const expectedSignature = hmac.digest('base64');
  return signature === expectedSignature;
}

const router = express.Router();
router.post('/square', bodyParser.json(), async (req, res) => {
  if (!verifySquareSignature(req)) {
    return res.status(400).send('Invalid signature');
  }
  const event = req.body;
  if (
    event.type === 'invoice.paid' ||
    event.type === 'invoice.payment_failed' ||
    event.type === 'invoice.canceled'
  ) {
    const invoice = event.data.object.invoice;
    try {
      await saveInvoice({
        customer_email: invoice.primary_recipient?.customer_email || '',
        stripe_invoice_id: invoice.id,
        amount: invoice.amount_money?.amount / 100 || 0,
        currency: invoice.amount_money?.currency || '',
        description: invoice.description || '',
        status: invoice.status
      });
      console.log(`🔔 Square Invoice event: ${event.type} for invoice ${invoice.id}`);
    } catch (err) {
      console.error('Failed to update Square invoice in DB:', err.message);
    }
  }
  res.status(200).send('OK');
});

module.exports = router;