require('dotenv').config();
const { Telegraf } = require('telegraf');
const editJsonFile = require("edit-json-file");
const express = require('express');

const bot = new Telegraf(process.env.BOT_TOKEN);
const db = editJsonFile(`${__dirname}/expenses.json`, { autosave: true });
const app = express();

// --- LOGIC ---

bot.start((ctx) => {
    ctx.replyWithMarkdown(
        `💰 *Elite Expense Tracker Initialized.*\n\n` +
        `Just type: \`[Amount] [Item]\` to log it.\n` +
        `Example: \`250 Coffee\`\n\n` +
        `Commands:\n/stats - View total spent\n/clear - Reset everything`
    );
});

// The "Smart Listener"
bot.on('text', (ctx) => {
    const text = ctx.message.text.trim();
    const [amountStr, ...itemArr] = text.split(' ');
    const amount = parseFloat(amountStr);
    const item = itemArr.join(' ') || "General";

    // Check if the first word is a number
    if (!isNaN(amount)) {
        const userId = ctx.from.id;
        const userData = db.get(userId.toString()) || { total: 0, logs: [] };

        userData.total += amount;
        userData.logs.push({ amount, item, date: new Date().toLocaleString() });
        
        db.set(userId.toString(), userData);
        ctx.reply(`✅ Logged ₹${amount} for "${item}". Total: ₹${userData.total}`);
    }
});

bot.command('stats', (ctx) => {
    const data = db.get(ctx.from.id.toString());
    if (!data) return ctx.reply("No expenses recorded yet.");
    ctx.replyWithMarkdown(`📊 *Financial Summary*\nTotal Spent: ₹${data.total}\nRecent: ${data.logs.slice(-3).map(l => l.item).join(', ')}`);
});

// --- SERVER FOR RENDER ---
app.get('/', (req, res) => res.send('Tracker is Online!'));
app.listen(process.env.PORT || 3000);

bot.launch().then(() => console.log("🚀 Expense Bot is Live!"));