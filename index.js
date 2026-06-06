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

// Configure Multer 
const upload = multer({ storage: multer.memoryStorage() });

let currentQR = '';
let waStatus = 'Initializing...';
let isProcessingCampaign = false; // Flag to prevent concurrent overlapping loops

// 🧹 Force clear stale cache on boot to ensure fresh frame contexts
if (fs.existsSync('./.wwebjs_auth')) {
    try {
        fs.rmSync('./.wwebjs_auth', { recursive: true, force: true });
        console.log('🧹 Clean state initialized.');
    } catch (e) {
        console.log('⚠️ Session folder busy, proceeding...');
    }
}

// ==========================================
// 1. WHATSAPP CLIENT CONFIGURATION
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
            '--disable-blink-features=AutomationControlled'
        ] 
    },
    // Modern user agent flag to bypass security refreshes
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
});

client.on('qr', async (qr) => {
    waStatus = 'Awaiting Scan';
    try {
        currentQR = await qrcode.toDataURL(qr); 
    } catch (err) {
        console.error('Failed generating QR code frame.');
    }
});

client.on('ready', () => {
    waStatus = 'Connected & Ready to Send!';
    currentQR = ''; 
    console.log('✅ System successfully authenticated and ready.');
});

client.on('disconnected', (reason) => {
    waStatus = 'Disconnected';
    isProcessingCampaign = false;
    console.log(`❌ WhatsApp session was destroyed: ${reason}`);
});

client.initialize().catch(err => console.error("Initialization failure:", err));

// ==========================================
// 2. TEMPLATE PARSING UTILITY
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
// 3. UI DASHBOARD ROUTE
// ==========================================
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f4f6f9;">
                <div style="max-width: 600px; margin: auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <h2>Outreach Engine Portal</h2>
                    <p>System State: <span style="padding: 5px 10px; background: #e0e0e0; border-radius: 4px; font-weight: bold;">${waStatus}</span></p>
                    
                    ${currentQR ? `<img src="${currentQR}" style="width: 250px; height: 250px; border: 1px solid #ccc; margin: 20px 0;"/><br><p style="color:#666;">Scan QR to bridge your session.</p>` : ''}
                    
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                    
                    <h3>Campaign Setup</h3>
                    <form action="/upload" method="POST" enctype="multipart/form-data" style="text-align: left;">
                        <label style="font-weight: bold; display: block; margin-top: 15px;">1. Upload Contacts Spreadsheet (.xlsx)</label>
                        <input type="file" name="excelFile" accept=".xlsx" required style="width: 100%; padding: 8px; margin-top: 5px;" />
                        
                        <label style="font-weight: bold; display: block; margin-top: 15px;">2. Attach Outreach Image (Optional)</label>
                        <input type="file" name="imageFile" accept="image/png, image/jpeg" style="width: 100%; padding: 8px; margin-top: 5px;" />
                        
                        <label style="font-weight: bold; display: block; margin-top: 15px;">3. Message Copy Layout</label>
                        <textarea name="messageTemplate" rows="5" required style="width: 100%; padding: 10px; margin-top: 5px; border-radius: 4px; border: 1px solid #ccc; font-family: inherit;">Hi ~Names~, is this you? Are you coming to ~Place~? <Link></textarea>
                        
                        <button type="submit" ${waStatus !== 'Connected & Ready to Send!' || isProcessingCampaign ? 'disabled' : ''} style="margin-top: 20px; width: 100%; padding: 12px; background: ${waStatus !== 'Connected & Ready to Send!' ? '#ccc' : '#25D366'}; color: white; border: none; font-size: 16px; font-weight:bold; border-radius: 4px; cursor: pointer;">
                            ${isProcessingCampaign ? 'Campaign Running...' : 'Launch Automation Pipeline'}
                        </button>
                    </form>
                </div>
            </body>
        </html>
    `);
});

// ==========================================
// 4. THE CAMPAIGN PIPELINE
// ==========================================
app.post('/upload', upload.fields([
    { name: 'excelFile', maxCount: 1 }, 
    { name: 'imageFile', maxCount: 1 }
]), async (req, res) => {
    if (waStatus !== 'Connected & Ready to Send!') {
        return res.status(400).send("Pipeline error: System session is offline.");
    }
    if (isProcessingCampaign) {
        return res.status(400).send("Pipeline error: A campaign run is already active.");
    }

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
        res.send("<h2>Campaign initialized. Progress streaming on cloud infrastructure engine logs.</h2>");
        console.log(`📊 Loaded ${rows.length} rows for validation schema pipeline.`);

        // --- Core Execution Loop ---
        for (let i = 0; i < rows.length; i++) {
            // Hard connection status check inside the loop to kill ghost executions instantly
            if (waStatus !== 'Connected & Ready to Send!') {
                console.error("🚨 Critical Error: Puppeteer disconnected during loop execution. Aborting pipeline process immediately.");
                break;
            }

            const row = rows[i];
            const rawNumbers = row['Phone Numbers']; 

            if (!rawNumbers) {
                console.log(`[Row ${i + 1}] Missing target 'Phone Numbers' field.`);
                continue;
            }

            const numberArray = String(rawNumbers).split(',');

            for (let rawNum of numberArray) {
                let cleanRawNum = rawNum.trim();
                if (!cleanRawNum) continue;

                try {
                    const numberObj = phoneUtil.parseAndKeepRawInput(cleanRawNum, 'SG');

                    if (!phoneUtil.isValidNumber(numberObj)) {
                        console.log(`[Row ${i + 1}] Flagged invalid phone configuration structural syntax: ${cleanRawNum}`);
                        continue;
                    }

                    const e164Format = phoneUtil.format(numberObj, PNF.E164);
                    const whatsappId = `${e164Format.replace('+', '')}@c.us`;

                    // Safely execute registration handshake validation check
                    const isRegistered = await client.isRegisteredUser(whatsappId);
                    if (!isRegistered) {
                        console.log(`[Row ${i + 1}] System verification: No WhatsApp account registered for target endpoint.`);
                        continue;
                    }

                    const personalizedText = formatMessage(templateText, row);

                    // True async resolution evaluation: code prints success ONLY if the promise resolves completely
                    if (imageMedia) {
                        await client.sendMessage(whatsappId, imageMedia, { caption: personalizedText });
                    } else {
                        await client.sendMessage(whatsappId, personalizedText);
                    }
                    
                    // Controlled logging rate output to satisfy Railway framework thresholds
                    console.log(`🚀 Row ${i + 1}/${rows.length} -> Outbound dispatched to endpoint ID: ${whatsappId}`);

                    // Throttled cooldown block (6-10 seconds) protects against browser reloads
                    const variableCooldown = Math.floor(Math.random() * 4000) + 6000;
                    await new Promise(r => setTimeout(r, variableCooldown));
                    break; 

                } catch (error) {
                    console.error(`❌ Unexpected loop fault detected on Row ${i + 1}: ${error.message}`);
                    if (error.message.includes('destroyed') || error.message.includes('detached')) {
                        waStatus = 'Disconnected';
                        break;
                    }
                }
            }
            if (waStatus !== 'Connected & Ready to Send!') break;
        }

        isProcessingCampaign = false;
        console.log('🎉 Automation loop sequence lifecycle has completed gracefully.');

    } catch (globalError) {
        isProcessingCampaign = false;
        console.error("Fatal deployment failure encountered:", globalError);
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Operational dashboard service listening on port ${port}`);
});