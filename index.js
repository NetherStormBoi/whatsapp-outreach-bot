const express = require('express');
const multer = require('multer');
const qrcode = require('qrcode');
const xlsx = require('xlsx');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const PNF = require('google-libphonenumber').PhoneNumberFormat;
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const port = process.env.PORT || 3000;

// Configure Multer to hold the uploaded Excel file in memory (no saving to disk)
const upload = multer({ storage: multer.memoryStorage() });

// Global variables to hold the WhatsApp state
let currentQR = '';
let waStatus = 'Initializing...';

// ==========================================
// 1. WHATSAPP ENGINE SETUP
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
            '--no-first-run'           
        ] 
    },
    // 🛡️ THE DISGUISE: Tell WhatsApp we are a normal Windows computer, not a cloud server
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    
    // 🛡️ THE VERSION FIX: Forces a stable web client version to prevent handshake failures
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

client.on('qr', async (qr) => {
    waStatus = 'Awaiting Scan';
    // Convert the raw QR text into an image URL for the web page
    currentQR = await qrcode.toDataURL(qr); 
    console.log('New QR generated.');
});

client.on('ready', () => {
    waStatus = 'Connected & Ready to Send!';
    currentQR = ''; // Clear the QR code once connected
    console.log('✅ WhatsApp Web is connected.');
});

client.initialize();

// ==========================================
// 2. THE WEB DASHBOARD (Frontend)
// ==========================================
app.get('/', (req, res) => {
    // This serves a simple HTML page to your browser
    res.send(`
        <html>
            <body style="font-family: Arial; padding: 50px; text-align: center;">
                <h2>WhatsApp Outreach Dashboard</h2>
                <p>Status: <strong>${waStatus}</strong></p>
                
                ${currentQR ? `<img src="${currentQR}" style="width: 250px; height: 250px; border: 1px solid black;"/><br><p>Refresh page to update QR</p>` : ''}
                
                <hr style="margin: 30px 0;">
                
                <h3>Upload Contacts (.xlsx)</h3>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <input type="file" name="excelFile" accept=".xlsx" required />
                    <button type="submit" style="padding: 10px 20px; background: blue; color: white; cursor: pointer;">Start Automation</button>
                </form>
            </body>
        </html>
    `);
});

// ==========================================
// 3. THE UPLOAD ROUTE & DATA PIPELINE
// ==========================================
app.post('/upload', upload.single('excelFile'), async (req, res) => {
    if (waStatus !== 'Connected & Ready to Send!') {
        return res.status(400).send("WhatsApp is not connected yet! Go back and scan the QR.");
    }

    // Read the Excel file directly from the uploaded buffer (memory)
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Send a success message back to your browser immediately
    res.send("<h2>File uploaded! The automation has started in the background.</h2><p>You can close this window.</p>");

    // --- Start the Outreach Loop ---
    console.log(`Starting outreach for ${data.length} potential rows...`);
    const link = "https://www.micron.com";

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const name = row['Names'];
        const rawNumbers = row['Phone Numbers'];

        if (name && rawNumbers) {
            const numberArray = String(rawNumbers).split(',');

            for (let rawNum of numberArray) {
                try {
                    let cleanRawNum = rawNum.trim();
                    const numberObj = phoneUtil.parseAndKeepRawInput(cleanRawNum, 'SG');

                    if (phoneUtil.isValidNumber(numberObj)) {
                        const e164Format = phoneUtil.format(numberObj, PNF.E164);
                        const whatsappId = `${e164Format.replace('+', '')}@c.us`;

                        // Ensure number has a WhatsApp account
                        const isRegistered = await client.isRegisteredUser(whatsappId);
                        if (isRegistered) {
                            const message = `Hi ${name}! This is an automated test from the new Node.js server. Link: ${link}`;
                            await client.sendMessage(whatsappId, message);
                            console.log(`✅ Sent to ${name}`);

                            // Safety delay (4-8 seconds)
                            const delayMs = Math.floor(Math.random() * 4000) + 4000;
                            await new Promise(r => setTimeout(r, delayMs));
                            break; // Stop checking other numbers for this person once one succeeds
                        }
                    }
                } catch (error) {
                    // Ignore parse errors and try the next number
                }
            }
        }
    }
    console.log('🎉 Automation loop finished!');
});

// Start the Express server and FORCE bind to 0.0.0.0
app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Web Dashboard running on port ${port}`);
});