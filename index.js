const express = require('express');
const multer = require('multer');
const qrcode = require('qrcode');
const xlsx = require('xlsx');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const PNF = require('google-libphonenumber').PhoneNumberFormat;
// 🟢 IMPORT MESSAGEMEDIA FOR IMAGES
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const app = express();
const port = process.env.PORT || 3000;

// Configure Multer to hold the uploaded Excel file and Image in memory
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

client.on('qr', async (qr) => {
    waStatus = 'Awaiting Scan';
    currentQR = await qrcode.toDataURL(qr); 
    console.log('New QR generated.');
});

client.on('ready', () => {
    waStatus = 'Connected & Ready to Send!';
    currentQR = ''; 
    console.log('✅ WhatsApp Web is connected.');
});

client.initialize();

// ==========================================
// 🟢 NEW FUNCTION: DYNAMIC VARIABLE INJECTION
// ==========================================
function formatMessage(template, rowData) {
    let finalMessage = template;

    // Replace ~Variable~ tags
    finalMessage = finalMessage.replace(/~([^~]+)~/g, (match, columnName) => {
        return rowData[columnName] !== undefined ? rowData[columnName] : match;
    });

    // Replace <Variable> tags
    finalMessage = finalMessage.replace(/<([^>]+)>/g, (match, columnName) => {
        return rowData[columnName] !== undefined ? rowData[columnName] : match;
    });

    return finalMessage;
}

// ==========================================
// 2. THE WEB DASHBOARD (Frontend)
// ==========================================
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: Arial; padding: 50px; text-align: center;">
                <h2>WhatsApp Outreach Dashboard</h2>
                <p>Status: <strong>${waStatus}</strong></p>
                
                ${currentQR ? `<img src="${currentQR}" style="width: 250px; height: 250px; border: 1px solid black;"/><br><p>Refresh page to update QR</p>` : ''}
                
                <hr style="margin: 30px 0;">
                
                <h3>Campaign Setup</h3>
                <form action="/upload" method="POST" enctype="multipart/form-data" style="max-width: 500px; margin: auto; text-align: left;">
                    
                    <label style="font-weight: bold; display: block; margin-top: 15px;">1. Upload Contacts (.xlsx)</label>
                    <input type="file" name="excelFile" accept=".xlsx" required style="width: 100%; padding: 5px;" />
                    
                    <label style="font-weight: bold; display: block; margin-top: 15px;">2. Attach Image (Optional)</label>
                    <input type="file" name="imageFile" accept="image/png, image/jpeg" style="width: 100%; padding: 5px;" />
                    
                    <label style="font-weight: bold; display: block; margin-top: 15px;">3. Message Template</label>
                    <p style="font-size: 12px; color: gray; margin: 2px 0 5px 0;">Use ~ColumnName~ for variables and &lt;ColumnName&gt; for links.</p>
                    <textarea name="messageTemplate" rows="6" required style="width: 100%; padding: 10px; box-sizing: border-box;">Hi ~Names~, is this you? Are you coming to ~Place~? <Link></textarea>
                    
                    <button type="submit" style="margin-top: 20px; width: 100%; padding: 15px; background: blue; color: white; border: none; font-size: 16px; cursor: pointer;">Start Campaign</button>
                </form>
            </body>
        </html>
    `);
});

// ==========================================
// 3. THE UPLOAD ROUTE & DATA PIPELINE
// ==========================================
// 🟢 UPDATED TO HANDLE BOTH EXCEL AND IMAGE UPLOADS
app.post('/upload', upload.fields([
    { name: 'excelFile', maxCount: 1 }, 
    { name: 'imageFile', maxCount: 1 }
]), async (req, res) => {
    if (waStatus !== 'Connected & Ready to Send!') {
        return res.status(400).send("WhatsApp is not connected yet! Go back and scan the QR.");
    }

    try {
        // 🟢 Extract Frontend Data
        const templateText = req.body.messageTemplate;
        const excelBuffer = req.files['excelFile'][0].buffer;
        
        // 🟢 Process Image (if uploaded)
        let imageMedia = null;
        if (req.files['imageFile']) {
            const img = req.files['imageFile'][0];
            imageMedia = new MessageMedia(img.mimetype, img.buffer.toString('base64'), img.originalname);
        }

        // Read Excel File
        const workbook = xlsx.read(excelBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        res.send("<h2>Campaign launched! Sending in the background.</h2><p>You can close this window.</p>");

        console.log(`Starting outreach for ${data.length} rows...`);

        // --- Start the Outreach Loop ---
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rawNumbers = row['Phone Numbers']; // Make sure your Excel column is exactly 'Phone Numbers'

            if (rawNumbers) {
                const numberArray = String(rawNumbers).split(',');

                for (let rawNum of numberArray) {
                    try {
                        let cleanRawNum = rawNum.trim();
                        const numberObj = phoneUtil.parseAndKeepRawInput(cleanRawNum, 'SG');

                        if (phoneUtil.isValidNumber(numberObj)) {
                            const e164Format = phoneUtil.format(numberObj, PNF.E164);
                            const whatsappId = `${e164Format.replace('+', '')}@c.us`;

                            const isRegistered = await client.isRegisteredUser(whatsappId);
                            if (isRegistered) {
                                
                                // 🟢 GENERATE DYNAMIC TEXT
                                const personalizedText = formatMessage(templateText, row);

                                // 🟢 SEND MESSAGE (WITH OR WITHOUT IMAGE)
                                if (imageMedia) {
                                    await client.sendMessage(whatsappId, imageMedia, { caption: personalizedText });
                                } else {
                                    await client.sendMessage(whatsappId, personalizedText);
                                }
                                
                                console.log(`✅ Sent to ${whatsappId}`);

                                // Safety delay (4-8 seconds)
                                const delayMs = Math.floor(Math.random() * 4000) + 4000;
                                await new Promise(r => setTimeout(r, delayMs));
                                break; 
                            }
                        }
                    } catch (error) {
                        // Ignore parse errors and try the next number
                    }
                }
            }
        }
        console.log('🎉 Automation loop finished!');
    } catch (error) {
        console.error("Critical Error during campaign:", error);
    }
});

// Start the Express server
app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Web Dashboard running on port ${port}`);
});