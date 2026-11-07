import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: "Method Not Allowed" });

    let body = req.body;
    if (!body) {
        let buffers = [];
        for await (let chunk of req) { buffers.push(chunk); }
        try { body = JSON.parse(Buffer.concat(buffers).toString()); } catch (e) { body = {}; }
    }

    const server = new McpServer({ name: "Email-Server", version: "1.0.0" });

    server.tool(
        "send_mail",
        "发送一封真实的电子邮件",
        {
            subject: z.string().describe("邮件主题"),
            content: z.string().describe("邮件正文内容"),
            sender_name: z.string().optional().describe("发件人名称")
        },
        async ({ subject, content, sender_name }) => {
            try {
                const myEmail = "2912218659@qq.com";
                const myAuthCode = "wjqjmpmhyhhndcfc"; 

                const transporter = nodemailer.createTransport({
                    host: 'smtp.qq.com', 
                    port: 587, 
                    secure: false, 
                    requireTLS: true,
                    connectionTimeout: 15000,
                    greetingTimeout: 15000,
                    auth: { user: myEmail, pass: myAuthCode }
                });
                await transporter.sendMail({
                    from: `"${sender_name || 'AI Companion'}" <${myEmail}>`,
                    to: myEmail,
                    subject: subject, text: content
                });
                return { content: [{ type: "text", text: "邮件发送成功！" }] };
            } catch (err) {
                return { content: [{ type: "text", text: "发送失败: " + err.message }], isError: true };
            }
        }
    );

    server.tool(
        "check_mail",
        "读取收件箱里的最新未读邮件",
        {},
        async () => {
            const myEmail = "2912218659@qq.com";
            const myAuthCode = "wjqjmpmhyhhndcfc";

            const client = new ImapFlow({
                host: 'imap.qq.com', port: 993, secure: true,
                auth: { user: myEmail, pass: myAuthCode },
                logger: false,
                connectionTimeout: 15000,
                greetingTimeout: 15000
            });
            try {
                await client.connect();
                let lock = await client.getMailboxLock('INBOX');
                let messages = [];
                try {
                    let searchResult = await client.search({ unseen: true });
                    if (searchResult && searchResult.length > 0) {
                        let range = searchResult.slice(-3).join(',');
                        for await (let message of client.fetch(range, { envelope: true, source: true })) {
                            let parsed = await simpleParser(message.source);
                            messages.push({
                                subject: message.envelope.subject || '无主题',
                                from: message.envelope.from[0]?.address || '未知',
                                content: (parsed.text || '').trim().slice(0, 500)
                            });
                        }
                        await client.messageFlagsAdd(range, ['\\Seen']);
                    }
                } finally { lock.release(); }
                await client.logout();
                if (messages.length === 0) return { content: [{ type: "text", text: "当前没有新的未读邮件。" }] };
                return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
            } catch (err) {
                return { content: [{ type: "text", text: "读取失败: " + err.message }], isError: true };
            }
        }
    );

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
}
