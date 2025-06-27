// commands/call.js

const axios = require('axios');
const config = require('../config');
const { requireRole } = require('../middlewares/accessControl');

// Use a session property unique to this command to avoid conflicts
function getCallSession(ctx) {
  if (!ctx.session) ctx.session = {};
  if (!ctx.session.callWizard) ctx.session.callWizard = {};
  return ctx.session.callWizard;
}

module.exports = function setupCallCommand(bot) {
  // Start the call wizard
  bot.command('call', requireRole(['admin', 'manager']), async (ctx) => {
    ctx.session.callWizard = { step: 'phone' };
    await ctx.reply('📞 Please provide the client phone number to call (e.g., 33612345678):');
  });

  // Cancel the call wizard
  bot.command('cancelcall', async (ctx) => {
    if (ctx.session && ctx.session.callWizard) {
      ctx.session.callWizard = null;
      return ctx.reply('❌ Call session canceled.');
    }
    return ctx.reply('ℹ️ No active call session found.');
  });

  // Handle wizard steps
  bot.on('message:text', async (ctx, next) => {
    const wizard = ctx.session && ctx.session.callWizard;
    if (!wizard || !wizard.step) return next();

    const text = ctx.message.text.trim();

    if (wizard.step === 'phone') {
      if (!/^\d{8,14}$/.test(text)) {
        return ctx.reply('❌ Invalid phone number. Please enter a valid number (e.g., 33612345678):');
      }
      wizard.phone = text;
      wizard.step = 'name';
      return ctx.reply('👤 Please enter the customer name:');
    }

    if (wizard.step === 'name') {
      if (!text || text.length < 2) {
        return ctx.reply('❌ Please enter a valid customer name:');
      }
      wizard.name = text;
      wizard.step = 'prompt';
      return ctx.reply('💬 Enter the prompt for the AI agent (or type "default" for standard):');
    }

    if (wizard.step === 'prompt') {
      wizard.prompt = text.toLowerCase() === 'default' ? '' : text;
      wizard.step = 'first_message';
      return ctx.reply('🗣️ Enter the first message for the AI agent (or type "default" for standard):');
    }

    if (wizard.step === 'first_message') {
      wizard.first_message = text.toLowerCase() === 'default' ? '' : text;
      // Send call request to outbound server
      try {
        const apiUrl = config.API_URL || 'http://localhost:8000/outbound-call';
        const payload = {
          number: wizard.phone,
          name: wizard.name,
          prompt: wizard.prompt,
          first_message: wizard.first_message,
        };
        const res = await axios.post(apiUrl, payload);
        if (res.data && res.data.success) {
          await ctx.reply(
            `📲 <b>Outbound call initiated!</b>\n\n<b>Phone:</b> ${wizard.phone}\n<b>Name:</b> ${wizard.name}\n<b>Prompt:</b> ${wizard.prompt || 'default'}\n<b>First message:</b> ${wizard.first_message || 'default'}\n<b>Call SID:</b> ${res.data.callSid}`,
            { parse_mode: 'HTML' }
          );
        } else {
          throw new Error(res.data && res.data.error ? res.data.error : 'Unknown error');
        }
      } catch (err) {
        await ctx.reply('⚠️ Failed to initiate outbound call: ' + (err.response?.data?.error || err.message));
      }
      ctx.session.callWizard = null;
      return;
    }

    // If step is unknown, reset
    ctx.session.callWizard = null;
    return ctx.reply('⚠️ Unknown session step. Please restart using /call.');
  });
};