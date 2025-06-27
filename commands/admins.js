const { getAdmins, addAdmin, removeAdmin, addUser, setUserRole, getAllUsers } = require('../db');
const config = require('../config');
const { InlineKeyboard } = require('grammy');

module.exports = async function adminsCommand(ctx) {
  // Show admin actions as inline keyboard with unique prefixes
  const keyboard = new InlineKeyboard()
    .text('List admins', 'admins:list').row()
    .text('List users', 'admins:listusers').row()
    .text('Add user', 'admins:adduser').row()
    .text('Delete user', 'admins:deleteuser').row()
    .text('Promote user to admin', 'admins:promote');
  return ctx.reply('Choose an admin action:', { reply_markup: keyboard });
};

// Handler for admin actions
module.exports.handleCallbackQuery = async function (ctx) {
  await ctx.answerCallbackQuery(); // Always answer callback to avoid loading spinner
  const data = ctx.callbackQuery.data;
  if (data === 'admins:list') {
    const dbAdmins = await getAdmins();
    const envAdmins = config.ADMINS
      ? String(config.ADMINS).split(',').map(x => x.trim())
      : [];
    const allAdmins = Array.from(new Set([...envAdmins, ...dbAdmins]));
    if (!allAdmins.length) return ctx.reply('No admins found.');
    return ctx.reply('Admins:\n' + allAdmins.map(a => `• ${a}`).join('\n'));
  }
  if (data === 'admins:listusers') {
    const users = await getAllUsers();
    if (!users.length) return ctx.reply('No users found.');
    return ctx.reply(
      'Users:\n' +
      users
        .map(
          u =>
            `• ${u.name} (${u.telegram_id}) [${u.role}]`
        )
        .join('\n')
    );
  }
  if (data === 'admins:adduser') {
    ctx.session.adminAction = 'adduser';
    ctx.session.addUserStep = 1;
    return ctx.reply('Enter the Telegram ID of the user to add:');
  }
  if (data === 'admins:deleteuser') {
    ctx.session.adminAction = 'deleteuser';
    return ctx.reply('Enter the Telegram ID of the user to delete:');
  }
  if (data === 'admins:promote') {
    ctx.session.adminAction = 'promote';
    return ctx.reply('Enter the Telegram ID of the user to promote to admin:');
  }
};

// Handler for text input after inline actions
module.exports.handleMessage = async function (ctx) {
  const action = ctx.session.adminAction;
  if (!action) return;
  try {
    // Add user flow: ask for ID, then name
    if (action === 'adduser') {
      if (ctx.session.addUserStep === 1) {
        ctx.session.addUserTelegramId = ctx.message.text.trim();
        ctx.session.addUserStep = 2;
        return ctx.reply('Enter the name of the user:');
      }
      if (ctx.session.addUserStep === 2) {
        const telegram_id = ctx.session.addUserTelegramId;
        const name = ctx.message.text.trim();
        await addUser(telegram_id, name, 'user');
        ctx.session.adminAction = null;
        ctx.session.addUserStep = null;
        ctx.session.addUserTelegramId = null;
        return ctx.reply(`✅ User ${name} (${telegram_id}) added as user.`);
      }
    }
    // Delete user (set role to 'removed')
    if (action === 'deleteuser') {
      const telegram_id = ctx.message.text.trim();
      await setUserRole(telegram_id, 'removed');
      ctx.session.adminAction = null;
      return ctx.reply(`✅ User ${telegram_id} marked as removed.`);
    }
    // Promote user to admin
    if (action === 'promote') {
      const telegram_id = ctx.message.text.trim();
      await setUserRole(telegram_id, 'admin');
      ctx.session.adminAction = null;
      return ctx.reply(`✅ User ${telegram_id} promoted to admin.`);
    }
    ctx.session.adminAction = null;
    return ctx.reply('Unknown action.');
  } catch (err) {
    ctx.session.adminAction = null;
    return ctx.reply('❌ Admin command failed: ' + err.message);
  }
};