const express = require('express');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const app = express();
app.use(express.json());

app.post('/api/send_mail', async (req, res) => {
    try {
        const { subject, content, sender_name } = req.body || {};
        if (!subject || !content) {
            return res.status(400).json({ error: '缺少 subject 或 content 参数' });
        }
        const transporter = nodemailer.createTransport({
            host: 'smtp.qq.com', port: 465, secure: true,
            auth: { user: process.env.QQ_EMAIL, pass: process.env.QQ_AUTH_CODE }
        });
        const info = await transporter.sendMail({
            from: `"${sender_name || 'AI Companion'}" <${process.env.QQ_EMAIL}>`,
            to: process.env.TO_EMAIL || process.env.QQ_EMAIL,
            subject: subject, text: content
        });
        res.status(200).json({ success: true, messageId: info.messageId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/check_mail', async (req, res) => {
    const client = new ImapFlow({
        host: 'imap.qq.com', port: 993, secure: true,
        auth: { user: process.env.QQ_EMAIL, pass: process.env.QQ_AUTH_CODE },
        logger: false
    });
    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        let messages = [];
        try {
            let searchResult = await client.search({ unseen: true });
            if (searchResult && searchResult.length > 0) {
                let targetSeq = searchResult.slice(-3);
                let range = targetSeq.join(',');
                for await (let message of client.fetch(range, { envelope: true, source: true })) {
                    let parsed = await simpleParser(message.source);
                    messages.push({
                        subject: message.envelope.subject || '无主题',
                        from: message.envelope.from[0]?.address || '未知发件人',
                        date: message.envelope.date,
                        content: (parsed.text || '（无文字正文）').trim().slice(0, 500)
                    });
                }
                messages.reverse();
                await client.messageFlagsAdd(range, ['\\Seen']);
            }
        } finally { lock.release(); }
        await client.logout();
        if (messages.length === 0) {
            return res.status(200).json({ success: true, count: 0, emails: [], notice: "当前没有收到新的未读邮件。" });
        }
        res.status(200).json({ success: true, count: messages.length, emails: messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
