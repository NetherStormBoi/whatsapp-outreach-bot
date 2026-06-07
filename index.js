const express = require('express');
const multer = require('multer');
const qrcode = require('qrcode');
const xlsx = require('xlsx');
const fs = require('fs');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const PNF = require('google-libphonenumber').PhoneNumberFormat;
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const randomUseragent = require('random-useragent');

const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

// Global State
let currentQR = '';
let waStatus = 'Initializing...';
let isProcessingCampaign = false;

// ==========================================
// 🛡️ STEALTH ENGINE: GAUSSIAN RANDOMIZER
// ==========================================
function getOrganicDelay(min, max) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
    num = num / 10.0 + 0.5; 
    if (num > 1 || num < 0) return getOrganicDelay(min, max); 
    return Math.floor(num * (max - min) + min);
}

// ==========================================
// 🛡️ STEALTH ENGINE: DYNAMIC FINGERPRINTING
// ==========================================
// Generate a completely random, valid desktop browser fingerprint for this specific session
const sessionUserAgent = randomUseragent.getRandom(function (ua) {
    return ua.deviceType === undefined && ua.osName === 'Windows' && parseFloat(ua.browserVersion) >= 110;
});

// ==========================================
// 🧹 PRE-FLIGHT CACHE WIPE
// ==========================================
if (fs.existsSync('./.wwebjs_auth')) {
    try {
        fs.rmSync('./.wwebjs_auth', { recursive: true, force: true });
        console.log('🧹 Ghost sessions wiped. Clean slate ready.');
    } catch (e) {
        console.log('⚠️ Session folder busy, proceeding...');
    }
}

// ==========================================
// 1. WHATSAPP ENGINE SETUP (Polymorphic)
// ==========================================
console.log(`🕵️ Session Fingerprint Spoofed: ${sessionUserAgent}`);

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
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            `--user-agent=${sessionUserAgent}` // Inject the dynamic fingerprint
        ] 
    },
    userAgent: sessionUserAgent 
});

client.on('qr', async (qr) => {
    waStatus = 'Awaiting Scan';
    try {
        currentQR = await qrcode.toDataURL(qr); 
        console.log('📱 Fresh QR Code generated.');
    } catch (err) {
        console.error('Failed generating QR code frame.');
    }
});

client.on('ready', () => {
    waStatus = 'Connected & Ready to Send!';
    currentQR = ''; 
    console.log('✅ Web Socket Handshake Complete. Stealth Mode Active.');
});

client.on('disconnected', (reason) => {
    waStatus = `Disconnected: ${reason}`;
    isProcessingCampaign = false; 
    console.log(`❌ WhatsApp session was destroyed: ${reason}`);
});

client.initialize().catch(err => console.error("Initialization failure:", err));

// ==========================================
// 2. DYNAMIC TEMPLATE PARSER
// ==========================================
function formatMessage(template, rowData) {
    let finalMessage = template;
    finalMessage = finalMessage.replace(/~([^~]+)~/g, (match, columnName) => {
        const trimmed = columnName.trim();
        return rowData[trimmed] !== undefined ? rowData[trimmed] : match;
    });
    finalMessage = finalMessage.replace(/<([^>]+)>/g, (match, columnName) => {
        const trimmed = columnName.trim();
        return rowData[trimmed] !== undefined ? rowData[trimmed] : match;
    });
    return finalMessage;
}

// ==========================================
// 3. UI DASHBOARD
// ==========================================
app.get('/', (req, res) => {
    const autoRefreshMeta = waStatus !== 'Connected & Ready to Send!' 
        ? '<meta http-equiv="refresh" content="3">' 
        : '';

    res.send(`
        <html>
            <head>
                ${autoRefreshMeta}
                <title>Local Outreach Engine</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #121212; color: #fff; }
                    .container { max-width: 600px; margin: auto; background: #1e1e1e; padding: 30px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                    .status { padding: 5px 10px; border-radius: 4px; font-weight: bold; background: ${waStatus === 'Connected & Ready to Send!' ? '#1b5e20' : '#424242'}; color: #fff; }
                    input, textarea, button { width: 100%; margin-top: 8px; margin-bottom: 20px; box-sizing: border-box; background: #2d2d2d; color: #fff; border: 1px solid #444; }
                    button { padding: 15px; font-size: 16px; font-weight: bold; border-radius: 4px; border: none; cursor: pointer; color: white; background: ${waStatus !== 'Connected & Ready to Send!' ? '#555' : '#00c853'}; }
                    button:disabled { cursor: not-allowed; }
                    label { font-weight: bold; display: block; text-align: left; color: #aaa; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Outreach Engine [Local Node]</h2>
                    <p>System State: <span class="status">${waStatus}</span></p>
                    
                    ${currentQR ? `<img src="${currentQR}" style="width: 250px; height: 250px; border: 3px solid #00c853; margin: 20px 0; border-radius: 8px;"/><br><p style="color:#888;">Scan to bridge encrypted session.</p>` : ''}
                    
                    <hr style="border: 0; border-top: 1px solid #333; margin: 30px 0;">
                    
                    <form action="/upload" method="POST" enctype="multipart/form-data" style="text-align: left;">
                        <label>1. Target Roster (.xlsx)</label>
                        <input type="file" name="excelFile" accept=".xlsx" required style="padding: 8px;" />
                        
                        <label>2. Visual Media (Optional)</label>
                        <input type="file" name="imageFile" accept="image/png, image/jpeg" style="padding: 8px;" />
                        
                        <label>3. Message Architecture</label>
                        <p style="font-size: 12px; color: #777; margin: -5px 0 10px 0;">Variables: ~ColumnName~ | Links: &lt;ColumnName&gt;</p>
                        <textarea name="messageTemplate" rows="5" required style="padding: 10px;">Hi ~Names~, checking in regarding your application. <Link></textarea>
                        
                        <button type="submit" ${waStatus !== 'Connected & Ready to Send!' || isProcessingCampaign ? 'disabled' : ''}>
                            ${isProcessingCampaign ? 'Executing Sequence...' : 'Initialize Launch Pipeline'}
                        </button>
                    </form>
                </div>
            </body>
        </html>
    `);
});

// ==========================================
// 4. BEHAVIORAL EXECUTION PIPELINE
// ==========================================
app.post('/upload', upload.fields([
    { name: 'excelFile', maxCount: 1 }, 
    { name: 'imageFile', maxCount: 1 }
]), async (req, res) => {
    if (waStatus !== 'Connected & Ready to Send!') return res.status(400).send("Offline.");
    if (isProcessingCampaign) return res.status(400).send("Running.");

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
        res.send("<h2 style='font-family: Arial; color: green;'>Pipeline Active. Check terminal for live execution logs.</h2>");
        console.log(`📊 Pipeline primed with ${rows.length} targets.`);

        for (let i = 0; i < rows.length; i++) {
            if (waStatus !== 'Connected & Ready to Send!') {
                console.error("🚨 Terminal Error: Handshake lost. Aborting sequence.");
                break;
            }

            const row = rows[i];
            const rawNumbers = row['Phone Numbers']; 

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
                    if (!isRegistered) continue;

                    const personalizedText = formatMessage(templateText, row);

                    // ========================================================
                    // 🧠 BEHAVIORAL SIMULATION 1: The "Ghost Read"
                    // ========================================================
                    console.log(`[Row ${i + 1}] Target locked: ${whatsappId}. Simulating organic presence...`);
                    const chat = await client.getChatById(whatsappId);
                    
                    // Simulate opening the chat and reading the screen
                    await chat.sendSeen();
                    await new Promise(r => setTimeout(r, getOrganicDelay(1500, 4000)));

                    // ========================================================
                    // 🧠 BEHAVIORAL SIMULATION 2: Contextual Typing Delay
                    // ========================================================
                    await chat.sendStateTyping();
                    
                    // Calculate human typing speed (roughly 5-7 chars per second)
                    const baseTypingMs = (personalizedText.length / 6) * 1000;
                    // Cap the max typing time at 12 seconds so the connection doesn't stall, add Gaussian variance
                    const simulatedTypingTime = Math.min(getOrganicDelay(baseTypingMs * 0.8, baseTypingMs * 1.2), 12000);
                    
                    await new Promise(r => setTimeout(r, simulatedTypingTime));
                    
                    if (imageMedia) {
                        await client.sendMessage(whatsappId, imageMedia, { caption: personalizedText });
                    } else {
                        await client.sendMessage(whatsappId, personalizedText);
                    }
                    
                    await chat.clearState();
                    console.log(`🚀 Payload delivered -> ${whatsappId}`);

                    // ========================================================
                    // 🧠 BEHAVIORAL SIMULATION 3: The Coffee Break
                    // ========================================================
                    if (i > 0 && i % (Math.floor(Math.random() * 8) + 12) === 0) {
                        const breakMinutes = Math.floor(Math.random() * 6) + 3; 
                        console.log(`☕ Organic variance triggered: Taking a ${breakMinutes}-minute screen break...`);
                        await new Promise(r => setTimeout(r, breakMinutes * 60 * 1000));
                    }

                    // ========================================================
                    // 🧠 BEHAVIORAL SIMULATION 4: Gaussian Transition
                    // ========================================================
                    const organicCooldown = getOrganicDelay(14000, 42000);
                    const microJitter = Math.floor(Math.random() * 800);
                    const finalWaitTime = organicCooldown + microJitter;

                    console.log(`⏳ Interface transition. Navigating to next target in ${(finalWaitTime/1000).toFixed(1)}s...`);
                    await new Promise(r => setTimeout(r, finalWaitTime));
                    
                    break; 

                } catch (error) {
                    console.error(`❌ Routine fault on Row ${i + 1}: ${error.message}`);
                    if (error.message.includes('destroyed') || error.message.includes('detached')) {
                        waStatus = 'Disconnected';
                        break;
                    }
                }
            }
            if (waStatus !== 'Connected & Ready to Send!') break;
        }

        isProcessingCampaign = false;
        console.log('🎉 Execution sequence gracefully terminated!');

    } catch (globalError) {
        isProcessingCampaign = false;
        console.error("Fatal deployment failure:", globalError);
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Local node active on port ${port}`);
});