const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

let client;
let qrCodeString = '';
let isClientReady = false;
let connectionStatus = 'Initializing...';

function initializeClient() {
    try {
        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './auth_data'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-extensions',
                    '--disable-plugins',
                    '--disable-images',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--hide-scrollbars',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-background-networking',
                    '--memory-pressure-off',
                    '--max_old_space_size=512'
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
            }
        });

        // Event handlers
        client.on('qr', (qr) => {
            qrCodeString = qr;
            connectionStatus = 'QR Code generated - ready to scan';
            console.log('QR Code generated. Visit /qr to scan it');
        });

        client.on('ready', () => {
            console.log('WhatsApp client is ready!');
            isClientReady = true;
            qrCodeString = '';
            connectionStatus = 'Connected and ready';
        });

        client.on('authenticated', () => {
            console.log('WhatsApp authenticated');
            connectionStatus = 'Authenticated';
        });

        client.on('auth_failure', (msg) => {
            console.error('Authentication failed:', msg);
            connectionStatus = 'Authentication failed';
        });

        client.on('disconnected', (reason) => {
            console.log('WhatsApp disconnected:', reason);
            connectionStatus = 'Disconnected: ' + reason;
            isClientReady = false;
            
            // Try to reconnect after 30 seconds
            setTimeout(() => {
                console.log('Attempting to reconnect...');
                initializeClient();
            }, 30000);
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
                            timestamp: message.timestamp,
                            type: message.type || 'chat'
                        })
                    });
                    console.log('Message sent to n8n successfully');
                } catch (error) {
                    console.error('Error sending to n8n:', error);
                }
            }
        });

        // Initialize the client
        client.initialize();
        
    } catch (error) {
        console.error('Error initializing client:', error);
        connectionStatus = 'Failed to initialize: ' + error.message;
        
        // Retry after 60 seconds
        setTimeout(() => {
            console.log('Retrying initialization...');
            initializeClient();
        }, 60000);
    }
}

// Routes
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Bot Status</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
                .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .status { padding: 15px; border-radius: 5px; margin: 20px 0; font-weight: bold; }
                .ready { background-color: #d4edda; color: #155724; }
                .waiting { background-color: #fff3cd; color: #856404; }
                .error { background-color: #f8d7da; color: #721c24; }
                .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
                .button:hover { background: #0056b3; }
            </style>
            <script>
                function refreshStatus() {
                    fetch('/status')
                        .then(response => response.json())
                        .then(data => {
                            document.getElementById('status').textContent = data.status;
                            document.getElementById('ready').textContent = data.ready ? 'Yes' : 'No';
                        })
                        .catch(error => console.error('Error:', error));
                }
                setInterval(refreshStatus, 5000); // Refresh every 5 seconds
            </script>
        </head>
        <body>
            <div class="container">
                <h1>🤖 WhatsApp Bot Dashboard</h1>
                
                <div class="status ${isClientReady ? 'ready' : 'waiting'}">
                    <strong>Status:</strong> <span id="status">${connectionStatus}</span>
                </div>
                
                <div class="status ${isClientReady ? 'ready' : 'waiting'}">
                    <strong>Ready to receive messages:</strong> <span id="ready">${isClientReady ? 'Yes' : 'No'}</span>
                </div>
                
                <div style="margin: 30px 0;">
                    <a href="/qr" class="button">📱 Scan QR Code</a>
                    <a href="/status" class="button">🔄 Check Status</a>
                    <a href="/test" class="button">🧪 Test Connection</a>
                </div>
                
                <h3>📊 Bot Information:</h3>
                <ul>
                    <li><strong>Server:</strong> Running on Railway</li>
                    <li><strong>n8n Webhook:</strong> ${process.env.N8N_WEBHOOK_URL ? 'Configured ✅' : 'Not configured ❌'}</li>
                    <li><strong>Last Update:</strong> ${new Date().toLocaleString()}</li>
                </ul>
                
                <h3>🔧 Troubleshooting:</h3>
                <ul>
                    <li>If status shows "Waiting", click "Scan QR Code"</li>
                    <li>If QR code doesn't appear, wait 2 minutes and refresh</li>
                    <li>If bot keeps disconnecting, check Railway logs</li>
                </ul>
            </div>
        </body>
        </html>
    `);
});

app.get('/qr', (req, res) => {
    if (!qrCodeString) {
        return res.send(`
            <html>
            <head><title>QR Code Status</title></head>
            <body style="font-family: Arial; text-align: center; margin: 50px;">
                <h1>⏳ QR Code Not Available</h1>
                <p>Current Status: <strong>${connectionStatus}</strong></p>
                <p>Possible reasons:</p>
                <ul style="text-align: left; max-width: 400px; margin: 20px auto;">
                    <li>Bot is already connected</li>
                    <li>Still initializing (wait 2 minutes)</li>
                    <li>Connection failed (check logs)</li>
                </ul>
                <button onclick="location.reload()">🔄 Refresh</button>
                <a href="/" style="margin-left: 20px;">← Back to Dashboard</a>
            </body>
            </html>
        `);
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp QR Code</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; margin: 40px; background: #f5f5f5; }
                .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
                .instructions { background: #e9ecef; padding: 20px; border-radius: 5px; margin: 20px 0; }
                #qrcode { margin: 20px auto; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📱 Scan QR Code with WhatsApp</h1>
                
                <div class="instructions">
                    <h3>Follow these steps:</h3>
                    <ol style="text-align: left;">
                        <li>Open WhatsApp on your phone</li>
                        <li>Go to <strong>Settings</strong> → <strong>Linked Devices</strong></li>
                        <li>Tap <strong>"Link a Device"</strong></li>
                        <li>Scan the QR code below</li>
                    </ol>
                </div>
                
                <div id="qrcode"></div>
                
                <p><em>QR Code will expire in 45 seconds. Refresh if needed.</em></p>
                <button onclick="location.reload()">🔄 Refresh QR Code</button>
                
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js"></script>
                <script>
                    QRCode.toCanvas(document.getElementById('qrcode'), '${qrCodeString}', {
                        width: 300,
                        margin: 2,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        }
                    });
                </script>
            </div>
        </body>
        </html>
    `);
});

app.get('/status', (req, res) => {
    res.json({
        ready: isClientReady,
        status: connectionStatus,
        hasQR: !!qrCodeString,
        webhookConfigured: !!(process.env.N8N_WEBHOOK_URL && process.env.N8N_WEBHOOK_URL !== 'YOUR_N8N_WEBHOOK_URL'),
        timestamp: new Date().toISOString()
    });
});

app.get('/test', (req, res) => {
    res.json({
        server: 'OK',
        whatsappClient: isClientReady ? 'Connected' : 'Not connected',
        n8nWebhook: process.env.N8N_WEBHOOK_URL ? 'Configured' : 'Not configured',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

app.post('/send', async (req, res) => {
    if (!isClientReady) {
        return res.status(400).json({ 
            error: 'Bot not ready',
            status: connectionStatus 
        });
    }
    
    const { number, message } = req.body;
    
    if (!number || !message) {
        return res.status(400).json({ 
            error: 'Both number and message are required' 
        });
    }
    
    try {
        const chatId = number.includes('@') ? number : `${number}@c.us`;
        await client.sendMessage(chatId, message);
        
        res.json({ 
            success: true,
            message: 'Message sent successfully',
            to: chatId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            error: 'Failed to send message',
            details: error.message 
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Server running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit your Railway URL to see the dashboard`);
});

// Initialize WhatsApp client
initializeClient();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    if (client) {
        client.destroy();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    if (client) {
        client.destroy();
    }
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    connectionStatus = 'Error: ' + error.message;
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    connectionStatus = 'Error: ' + reason;
});
