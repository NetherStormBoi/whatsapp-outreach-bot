const express = require('express');
const multer = require('multer');
const qrcode = require('qrcode');
const xlsx = require('xlsx');
const fs = require('fs');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const PNF = require('google-libphonenumber').PhoneNumberFormat;
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const app = express();
const port = process.env.PORT || 3000;

// Configure Multer for in-memory file processing
const upload = multer({ storage: multer.memoryStorage() });

// Global State
let currentQR = '';
let waStatus = 'Initializing...';
let isProcessingCampaign = false;

// ==========================================
// 🛡️ ANTI-ML: GAUSSIAN RANDOM GENERATOR
// ==========================================
// Generates a "bell curve" distribution instead of a flat robotic uniform distribution
function getOrganicDelay(min, max) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    num = num / 10.0 + 0.5; // Translate to 0 -> 1
    if (num > 1 || num < 0) return getOrganicDelay(min, max); // Resample if outlier
    return Math.floor(num * (max - min) + min);
}

// ==========================================
// 🧹 PRE-FLIGHT: NUKE CORRUPT CACHES
// ==========================================
if (fs.existsSync('./.wwebjs_auth')) {
    try {
        fs.rmSync('./.wwebjs_auth', { recursive: true, force: true });
        console.log('🧹 Clean slate initialized. Old caches swept away.');
    } catch (e) {
        console.log('⚠️ Session folder busy, proceeding...');
    }
}

// ==========================================
// 1. WHATSAPP ENGINE SETUP & STEALTH DISGUISE
// ==========================================
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',           
            '--no-first-run',
            '--disable-blink-features=AutomationControlled' // 🛡️ Hide Puppeteer flags
        ] 
    },
    // 🛡️ Fresher Chrome User-Agent Disguise
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
});

client.on('qr', async (qr) => {
    waStatus = 'Awaiting Scan';
    try {
        currentQR = await qrcode.toDataURL(qr); 
        console.log('📱 New QR Code ready for scan.');
    } catch (err) {
        console.error('Failed generating QR code frame.');
    }
});

client.on('ready', () => {
    waStatus = 'Connected & Ready to Send!';
    currentQR = ''; 
    console.log('✅ WhatsApp Web is officially connected.');
});

client.on('disconnected', (reason) => {
    waStatus = `Disconnected: ${reason}`;
    isProcessingCampaign = false; // Instantly abort any running campaigns
    console.log(`❌ WhatsApp session was destroyed: ${reason}`);
});

client.initialize().catch(err => console.error("Initialization failure:", err));

// ==========================================
// 2. DYNAMIC TEMPLATE INJECTION
// ==========================================
function formatMessage(template, rowData) {
    let finalMessage = template;
    // Replace ~Variable~
    finalMessage = finalMessage.replace(/~([^~]+)~/g, (match, columnName) => {
        const trimmed = columnName.trim();
        return rowData[trimmed] !== undefined ? rowData[trimmed] : match;
    });
    // Replace <Variable>
    finalMessage = finalMessage.replace(/<([^>]+)>/g, (match, columnName) => {
        const trimmed = columnName.trim();
        return rowData[trimmed] !== undefined ? rowData[trimmed] : match;
    });
    return finalMessage;
}

// ==========================================
// 3. THE UI DASHBOARD (Auto-Refreshing)
// ==========================================
app.get('/', (req, res) => {
    // 🔄 Auto-refresh the page every 3 seconds ONLY if waiting for a scan
    const autoRefreshMeta = waStatus !== 'Connected & Ready to Send!' 
        ? '<meta http-equiv="refresh" content="3">' 
        : '';

    res.send(`
        <html>
            <head>
                ${autoRefreshMeta}
                <title>Outreach Engine</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f4f6f9; }
                    .container { max-width: 600px; margin: auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    .status { padding: 5px 10px; border-radius: 4px; font-weight: bold; background: ${waStatus === 'Connected & Ready to Send!' ? '#d4edda' : '#e0e0e0'}; color: ${waStatus === 'Connected & Ready to Send!' ? '#155724' : '#333'};}
                    input, textarea, button { width: 100%; margin-top: 8px; margin-bottom: 20px; box-sizing: border-box; }
                    button { padding: 15px; font-size: 16px; font-weight: bold; border-radius: 4px; border: none; cursor: pointer; color: white; background: ${waStatus !== 'Connected & Ready to Send!' ? '#ccc' : '#25D366'}; }
                    button:disabled { cursor: not-allowed; }
                    label { font-weight: bold; display: block; text-align: left; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Outreach Engine Portal</h2>
                    <p>System State: <span class="status">${waStatus}</span></p>
                    
                    ${currentQR ? `<img src="${currentQR}" style="width: 250px; height: 250px; border: 1px solid #ccc; margin: 20px 0;"/><br><p style="color:#666;">Scan QR to bridge your session.</p>` : ''}
                    
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                    
                    <h3>Setup</h3>
                    <form action="/upload" method="POST" enctype="multipart/form-data" style="text-align: left;">
                        <label>1. Upload Contacts (.xlsx)</label>
                        <input type="file" name="excelFile" accept=".xlsx" required style="padding: 8px;" />
                        
                        <label>2. Attach Image (Optional)</label>
                        <input type="file" name="imageFile" accept="image/png, image/jpeg" style="padding: 8px;" />
                        
                        <label>3. Message Template</label>
                        <p style="font-size: 12px; color: gray; margin: -5px 0 10px 0;">Variables: ~ColumnName~ | Links: &lt;ColumnName&gt;</p>
                        <textarea name="messageTemplate" rows="5" required style="padding: 10px;">Hi ~Names~, this is a test! Please report to ~Place~. <Link></textarea>
                        
                        <button type="submit" ${waStatus !== 'Connected & Ready to Send!' || isProcessingCampaign ? 'disabled' : ''}>
                            ${isProcessingCampaign ? 'Campaign Running in Background...' : 'Launch Automation Pipeline'}
                        </button>
                    </form>
                </div>
            </body>
        </html>
    `);
});

// ==========================================
// 4. THE OUTREACH PIPELINE (Anti-ML Logic)
// ==========================================
app.post('/upload', upload.fields([
    { name: 'excelFile', maxCount: 1 }, 
    { name: 'imageFile', maxCount: 1 }
]), async (req, res) => {
    if (waStatus !== 'Connected & Ready to Send!') return res.status(400).send("Error: System is offline.");
    if (isProcessingCampaign) return res.status(400).send("Error: A campaign is already running.");

    try {
        const templateText = req.body.messageTemplate;
        const excelBuffer = req.files['excelFile'][0].buffer;
        
        let imageMedia = null;
        if (req.files['imageFile']) {
            const img = req.files['imageFile'][0];
            imageMedia = new MessageMedia(img.mimetype, img.buffer.toString('base64'), img.originalname);
        }

        const workbook = xlsx.read(excelBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        isProcessingCampaign = true;
        res.send("<h2>Pipeline initialized!</h2><p>Messages are slowly sending in the background to avoid spam filters. You can close this window and monitor the Railway logs.</p>");
        console.log(`📊 Loaded ${rows.length} rows for outreach.`);

        // --- Core Execution Loop ---
        for (let i = 0; i < rows.length; i++) {
            // 🚨 HARD STOP: If Meta forces a logout or crash, instantly abort the loop
            if (waStatus !== 'Connected & Ready to Send!') {
                console.error("🚨 Critical Error: Puppeteer disconnected. Aborting pipeline.");
                break;
            }

            const row = rows[i];
            const rawNumbers = row['Phone Numbers']; // MUST exactly match Excel column header

            if (!rawNumbers) continue;

            const numberArray = String(rawNumbers).split(',');

            for (let rawNum of numberArray) {
                let cleanRawNum = rawNum.trim();
                if (!cleanRawNum) continue;

                try {
                    const numberObj = phoneUtil.parseAndKeepRawInput(cleanRawNum, 'SG');
                    if (!phoneUtil.isValidNumber(numberObj)) continue;

                    const e164Format = phoneUtil.format(numberObj, PNF.E164);
                    const whatsappId = `${e164Format.replace('+', '')}@c.us`;

                    const isRegistered = await client.isRegisteredUser(whatsappId);
                    if (!isRegistered) {
                        console.log(`[Row ${i + 1}] Skip: Number not registered on WhatsApp.`);
                        continue;
                    }

                    const personalizedText = formatMessage(templateText, row);

                    // ========================================================
                    // 🛡️ STEALTH SEQUENCE 1: Organic Typing Simulation
                    // ========================================================
                    console.log(`[Row ${i + 1}] Engaging stealth mode for ${whatsappId}...`);
                    const chat = await client.getChatById(whatsappId);
                    
                    await chat.sendStateTyping();
                    
                    // Human typing varies wildly. Bell curve between 2 and 7 seconds.
                    const organicTypingDelay = getOrganicDelay(2000, 7000);
                    await new Promise(r => setTimeout(r, organicTypingDelay));
                    
                    if (imageMedia) {
                        await client.sendMessage(whatsappId, imageMedia, { caption: personalizedText });
                    } else {
                        await client.sendMessage(whatsappId, personalizedText);
                    }
                    
                    await chat.clearState();
                    console.log(`🚀 SUCCESSFULLY SENT -> ${whatsappId}`);

                    // ========================================================
                    // 🛡️ STEALTH SEQUENCE 2: The "Coffee Break" Algorithm
                    // ========================================================
                    // Every 15 to 25 messages, the bot simulates getting up from the desk.
                    if (i > 0 && i % (Math.floor(Math.random() * 10) + 15) === 0) {
                        const breakMinutes = Math.floor(Math.random() * 8) + 4; // 4 to 11 minute break
                        const breakMs = breakMinutes * 60 * 1000;
                        console.log(`☕ ANTI-ML TRIGGERED: Simulating a human break for ${breakMinutes} minutes...`);
                        await new Promise(r => setTimeout(r, breakMs));
                    }

                    // ========================================================
                    // 🛡️ STEALTH SEQUENCE 3: Gaussian Cooldown + Micro-Jitter
                    // ========================================================
                    // Standard delay between candidates. Bell curve between 12 and 38 seconds.
                    const organicCooldown = getOrganicDelay(12000, 38000);
                    
                    // Add a tiny "micro-jitter" (1-500ms) to bypass signature matching
                    const microJitter = Math.floor(Math.random() * 500);
                    const finalWaitTime = organicCooldown + microJitter;

                    console.log(`⏳ Organic cooldown. Waiting ${(finalWaitTime/1000).toFixed(1)}s before next candidate...`);
                    await new Promise(r => setTimeout(r, finalWaitTime));
                    
                    break; 

                } catch (error) {
                    console.error(`❌ Loop fault on Row ${i + 1}: ${error.message}`);
                    if (error.message.includes('destroyed') || error.message.includes('detached')) {
                        waStatus = 'Disconnected';
                        break;
                    }
                }
            }
            if (waStatus !== 'Connected & Ready to Send!') break;
        }

        isProcessingCampaign = false;
        console.log('🎉 Automation sequence finished!');

    } catch (globalError) {
        isProcessingCampaign = false;
        console.error("Fatal deployment failure:", globalError);
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Server running on port ${port}`);
});