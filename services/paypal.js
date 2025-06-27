const fetch = require('node-fetch');
const config = require('../config');

const BASE_URL =
  config.PAYPAL_ENV === 'live'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

async function getAccessToken() {
  const auth = Buffer.from(
    `${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  console.log('PayPal: Requesting access token...');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  console.log('PayPal: Access token response received');
  if (!res.ok) {
    const err = await res.text();
    console.error('PayPal Auth Error:', err);
    throw new Error(`Failed to authenticate with PayPal: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function createPayPalInvoice({
  name,
  email,
  description,
  amount,
  items = [],
  currency_code = 'USD',
  due_date,
  billing_info,
  logo_url,
  metadata = {}
}) {
  try {
    console.log('PayPal: Creating invoice for', { name, email, description, amount });
    const accessToken = await getAccessToken();
    console.log('PayPal: Got access token');

    const invoiceItems = items.length
      ? items.map(item => ({
          name: item.name,
          quantity: item.quantity?.toString() || '1',
          unit_amount: {
            currency_code,
            value: Number(item.unit_amount).toFixed(2)
          },
          tax: item.tax
            ? {
                name: item.tax.name,
                percent: item.tax.percent.toString()
              }
            : undefined
        }))
      : [
          {
            name: description,
            quantity: '1',
            unit_amount: {
              currency_code,
              value: Number(amount).toFixed(2)
            }
          }
        ];

    // 1. Create invoice
    console.log('PayPal: Sending create invoice request...');
    const createRes = await fetch(`${BASE_URL}/v2/invoicing/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        detail: {
          currency_code,
          note: description,
          terms_and_conditions: 'Thank you for your business.',
          due_date,
          metadata,
          ...(logo_url && { logo_url })
        },
        invoicer: {
          name: { given_name: name }
        },
        primary_recipients: [
          {
            billing_info: {
              email_address: email,
              ...(billing_info && { address: billing_info })
            }
          }
        ],
        items: invoiceItems
      })
    });
    console.log('PayPal: Create invoice response received');
    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('PayPal Invoice Creation Error:', err);
      return {
        error: true,
        message: `PayPal invoice creation failed: ${err}`,
        details: err
      };
    }

    // --- FIX: Extract invoice ID from Location header if not in body ---
    const invoice = await createRes.json().catch(() => ({}));
    let invoiceId = invoice.id;
    const location = createRes.headers.get('location');
    if (!invoiceId && location) {
      const match = location.match(/\/invoices\/([^/]+)$/);
      if (match) invoiceId = match[1];
    }
    console.log('PayPal: Invoice ID:', invoiceId, 'Location:', location);
    if (!invoiceId) {
      const msg = 'Could not determine PayPal invoice ID after creation.';
      console.error(msg);
      return {
        error: true,
        message: msg,
        details: null
      };
    }

    // 2. Wait for invoice to be available via GET (using Location header)
    let fetchedInvoice = null;
    for (let i = 0; i < 10; i++) {
      console.log(`PayPal: Checking invoice availability, attempt ${i + 1}`);
      const getRes = await fetch(location, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (getRes.ok) {
        fetchedInvoice = await getRes.json();
        break;
      }
      await new Promise(res => setTimeout(res, 1000));
    }
    if (!fetchedInvoice) {
      const msg = 'PayPal invoice not available after creation.';
      console.error(msg);
      return {
        error: true,
        message: msg,
        details: null
      };
    }

    // 3. Send invoice (now that GET works)
    let sendOk = false, sendErr = null;
    for (let i = 0; i < 5; i++) {
      console.log(`PayPal: Attempting to send invoice, try ${i + 1}`);
      const sendRes = await fetch(
        `${BASE_URL}/v2/invoicing/invoices/${invoiceId}/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      if (sendRes.ok) {
        sendOk = true;
        console.log('PayPal: Send invoice response received');
        break;
      } else {
        sendErr = await sendRes.text();
        console.error('PayPal Invoice Send Error:', sendErr);
        if (i < 4) await new Promise(res => setTimeout(res, 1000));
      }
    }
    if (!sendOk) {
      return {
        error: true,
        message: `PayPal invoice send failed: ${sendErr}`,
        details: sendErr
      };
    }

    // Compose invoice URL
    const invoiceUrl = `https://www.paypal.com/invoice/payerView/details/${invoiceId}`;
    console.log('PayPal: Invoice created and sent:', invoiceUrl);
    return {
      invoiceUrl,
      invoiceId,
      status: fetchedInvoice.status || 'SENT',
      amount: invoiceItems.reduce(
        (sum, item) => sum + parseFloat(item.unit_amount.value) * parseInt(item.quantity),
        0
      ),
      due_date,
      metadata
    };
  } catch (error) {
    console.error('PayPal Invoice Exception:', error);
    return {
      error: true,
      message: error.message,
      details: error
    };
  }
}

// Retrieve invoice details
async function getPayPalInvoice(invoiceId) {
  try {
    const accessToken = await getAccessToken();
    const res = await fetch(`${BASE_URL}/v2/invoicing/invoices/${invoiceId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('PayPal Get Invoice Error:', err);
      throw new Error(`PayPal get invoice failed: ${err}`);
    }
    return await res.json();
  } catch (error) {
    console.error('PayPal Get Invoice Exception:', error);
    return {
      error: true,
      message: error.message,
      details: error
    };
  }
}

// List invoices (with optional status filter)
async function listPayPalInvoices({ status, page = 1, page_size = 10 } = {}) {
  try {
    const accessToken = await getAccessToken();
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: page_size.toString()
    });
    if (status) params.append('status', status);
    const res = await fetch(`${BASE_URL}/v2/invoicing/invoices?${params.toString()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('PayPal List Invoices Error:', err);
      throw new Error(`PayPal list invoices failed: ${err}`);
    }
    return await res.json();
  } catch (error) {
    console.error('PayPal List Invoices Exception:', error);
    return {
      error: true,
      message: error.message,
      details: error
    };
  }
}

module.exports = {
  createPayPalInvoice,
  getPayPalInvoice,
  listPayPalInvoices
};