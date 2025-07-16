const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

let qrCodeString = '';
let isClientReady = false;

// QR Code generation
client.on('qr', (qr) => {
    qrCodeString = qr;
    console.log('QR Code generated. Visit /qr to see it');
});

// Client ready
client.on('ready', () => {
    console.log('WhatsApp client is ready!');
    isClientReady = true;
    qrCodeString = '';
});

// Handle incoming messages
client.on('message', async (message) => {
    console.log('Received message:', message.body);

    // Send to n8n webhook
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

    if (n8nWebhookUrl && n8nWebhookUrl !== 'YOUR_N8N_WEBHOOK_URL') {
        try {
            await fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: message.from,
                    body: message.body,
                    timestamp: message.timestamp
                })
            });
        } catch (error) {
            console.error('Error sending to n8n:', error);
        }
    }
});

// Routes
app.get('/', (req, res) => {
    res.send(`
        <h1>WhatsApp Bot Status</h1>
        <p>Status: ${isClientReady ? 'Ready ✅' : 'Waiting for QR scan 📱'}</p>
        <p><a href="/qr">Scan QR Code</a></p>
        <p><a href="/status">Check Status</a></p>
    `);
});

app.get('/qr', (req, res) => {
    if (!qrCodeString) {
        return res.send('<h1>No QR code available</h1><p>Bot might already be connected</p>');
    }

    res.send(`
        <h1>Scan this QR Code with WhatsApp</h1>
        <div id="qrcode"></div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js"></script>
        <script>
            QRCode.toCanvas(document.getElementById('qrcode'), '${qrCodeString}', {
                width: 300
            });
        </script>
    `);
});

app.get('/status', (req, res) => {
    res.json({ ready: isClientReady });
});

app.post('/send', async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ error: 'Bot not ready' });
    }

    const { number, message } = req.body;

    try {
        const chatId = `${number}@c.us`;
        await client.sendMessage(chatId, message);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

client.initialize();