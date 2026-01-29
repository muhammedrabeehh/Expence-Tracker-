require('dotenv').config();
const { Telegraf } = require('telegraf');
const editJsonFile = require("edit-json-file");
const cron = require('node-cron');
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const db = editJsonFile(`${__dirname}/expenses.json`, { autosave: true });
const app = express();
const TZ = "Asia/Kolkata";

// YOUR SECRET KEY (Change this to whatever you want)
const ADMIN_SECRET_CODE = "ADMIN-7788"; 

const userState = {};
const getTodayDate = () => new Date().toLocaleDateString('en-IN');

// --- 🛡️ SECURITY MIDDLEWARE (GATEKEEPER) ---
bot.use(async (ctx, next) => {
    const userId = ctx.from.id.toString();
    const userData = db.get(userId) || { authorized: false };
    const text = ctx.message?.text;

    // 1. If user sends the Secret Code, authorize them
    if (text === ADMIN_SECRET_CODE) {
        db.set(`${userId}.authorized`, true);
        return ctx.reply("✅ *ACCESS GRANTED*\n\nWelcome, Admin. The Elite Expense Protocol is now unlocked for you.", { parse_mode: 'Markdown' });
    }

    // 2. If user is already authorized, let them pass to the bot logic
    if (userData.authorized) {
        return next();
    }

    // 3. If not authorized, block everything and ask for the code
    return ctx.reply("🛡️ *SECURITY ALERT*\n━━━━━━━━━━━━━\nThis is a private Intelligence Bot. You are not authorized.\n\n*Please enter the Activation Code to proceed.*", { parse_mode: 'Markdown' });
});

// --- 1. ELITE WELCOME ---
bot.start(async (ctx) => {
    const name = ctx.from.first_name || "Operative";
    await ctx.replyWithMarkdown(`👋 *Welcome back, ${name}!*`);
    await ctx.replyWithMarkdown(
        `🛠 *System Manual*\n━━━━━━━━━━━━━\n\n` +
        `💰 *Logging:* \`[Amount] [Item]\`\n` +
        `📑 *Commands:*\n` +
        `• /stats — Today's briefing\n` +
        `• /setlimit [amount] — Set budget\n` +
        `• /addbill — Save a receipt\n` +
        `• /bills — View stored bills\n` +
        `• /clear — Wipe today's data`
    );
});

// --- 2. BILL VAULT LOGIC ---
bot.command('addbill', (ctx) => {
    userState[ctx.from.id] = { step: 'AWAITING_PHOTO' };
    ctx.reply("📸 Send the photo of your bill.");
});

bot.command('bills', (ctx) => {
    const data = db.get(ctx.from.id.toString()) || { vault: [] };
    if (!data.vault || data.vault.length === 0) return ctx.reply("📂 Your vault is empty.");
    let msg = `📂 *Stored Bills*\n━━━━━━━━━━━━━\n\n`;
    data.vault.forEach((b, i) => msg += `${i + 1}. ${b.label} (${b.date})\n`);
    msg += `\n*View one:* \`/view [number]\``;
    ctx.replyWithMarkdown(msg);
});

bot.command('view', async (ctx) => {
    const index = parseInt(ctx.message.text.split(' ')[1]) - 1;
    const data = db.get(ctx.from.id.toString()) || { vault: [] };
    if (data.vault && data.vault[index]) {
        await ctx.replyWithPhoto(data.vault[index].fileId, { 
            caption: `📄 *Bill:* ${data.vault[index].label}\n📅 *Date:* ${data.vault[index].date}`,
            parse_mode: 'Markdown' 
        });
    } else ctx.reply("❌ Not found.");
});

// --- 3. COMMANDS ---
bot.command('stats', (ctx) => {
    const userId = ctx.from.id.toString();
    const data = db.get(userId) || { logs: [] };
    const today = getTodayDate();
    const todayLogs = data.logs.filter(l => l.date === today);
    const total = todayLogs.reduce((s, l) => s + l.amount, 0);
    if (todayLogs.length === 0) return ctx.replyWithMarkdown(`📊 *Briefing for ${today}*\n\nNo records.`);
    let msg = `📊 *Briefing for ${today}*\n━━━━━━━━━━━━━\n\n`;
    todayLogs.forEach(l => msg += `• ${l.item}: ₹${l.amount}\n`);
    msg += `\n💰 *Total: ₹${total}*`;
    ctx.replyWithMarkdown(msg);
});

bot.command('setlimit', (ctx) => {
    const amount = parseFloat(ctx.message.text.split(' ')[1]);
    if (isNaN(amount)) return ctx.reply("❌ Usage: /setlimit 1000");
    db.set(`${ctx.from.id}.dailyLimit`, amount);
    ctx.reply(`🎯 Limit set to ₹${amount}.`);
});

bot.command('clear', (ctx) => {
    const userId = ctx.from.id.toString();
    const data = db.get(userId) || { logs: [] };
    db.set(`${userId}.logs`, data.logs.filter(l => l.date !== getTodayDate()));
    ctx.reply("🗑️ Today's data wiped.");
});

// --- 4. SMART LOGGING & STATE HANDLER ---
bot.on(['photo', 'text'], async (ctx) => {
    const userId = ctx.from.id;
    const state = userState[userId];
    if (state) {
        if (state.step === 'AWAITING_PHOTO' && ctx.message.photo) {
            state.fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            state.step = 'AWAITING_LABEL';
            return ctx.reply("📝 What is this bill for?");
        }
        if (state.step === 'AWAITING_LABEL' && ctx.message.text) {
            const data = db.get(userId.toString()) || { vault: [] };
            data.vault.push({ label: ctx.message.text, fileId: state.fileId, date: getTodayDate() });
            db.set(userId.toString(), data);
            delete userState[userId];
            return ctx.reply("✅ Bill Saved!");
        }
    }
    if (ctx.message.text && !ctx.message.text.startsWith('/')) {
        const [amountStr, ...itemArr] = ctx.message.text.split(' ');
        const amount = parseFloat(amountStr);
        if (!isNaN(amount)) {
            const data = db.get(userId.toString()) || { logs: [], dailyLimit: 0 };
            data.logs.push({ amount, item: itemArr.join(' ') || "Misc", date: getTodayDate(), month: new Date().getMonth() });
            db.set(userId.toString(), data);
            await ctx.reply(`✅ Logged: ₹${amount}`);
        }
    }
});

// --- 5. AUTOMATED REPORTS (CRON) ---
cron.schedule('0 21 * * *', () => {
    const all = db.toObject();
    const today = getTodayDate();
    Object.keys(all).forEach(id => {
        if (all[id].authorized) {
            const logs = all[id].logs?.filter(l => l.date === today) || [];
            if (logs.length > 0) {
                let msg = `🌙 *Daily Report*\n\n` + logs.map(l => `• ${l.item}: ₹${l.amount}`).join('\n');
                msg += `\n\n💰 *Total: ₹${logs.reduce((s,l)=>s+l.amount,0)}*`;
                bot.telegram.sendMessage(id, msg, { parse_mode: 'Markdown' });
            }
        }
    });
}, { timezone: TZ });

app.get('/', (req, res) => res.send('Bot Security Active'));
app.listen(process.env.PORT || 3000);
bot.launch();