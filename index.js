const xlsx = require('xlsx');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const PNF = require('google-libphonenumber').PhoneNumberFormat;
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ==========================================
// 1. DATA PIPELINE: Parse Excel & Fix Numbers
// ==========================================
function processExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const outreachList = [];

    data.forEach(row => {
        const name = row['Names'];
        const rawNumbers = row['Phone Numbers'];

        if (name && rawNumbers) {
            // Split by comma in case of multiple numbers
            const numberArray = String(rawNumbers).split(',');

            numberArray.forEach(rawNum => {
                let cleanRawNum = rawNum.trim();

                try {
                    // 'SG' is the fallback if they didn't provide a country code (+)
                    const number = phoneUtil.parseAndKeepRawInput(cleanRawNum, 'SG');

                    if (phoneUtil.isValidNumber(number)) {
                        const e164Format = phoneUtil.format(number, PNF.E164);
                        const whatsappFormatted = e164Format.replace('+', ''); // WhatsApp removes the +

                        outreachList.push({
                            name: name,
                            whatsappId: `${whatsappFormatted}@c.us`
                        });
                    } else {
                        console.log(`⚠️ Invalid number skipped for ${name}: ${cleanRawNum}`);
                    }
                } catch (error) {
                    console.log(`❌ Parse failure for ${name}: ${cleanRawNum}`);
                }
            });
        }
    });

    return outreachList;
}

// ==========================================
// 2. COMMUNICATION LAYER: WhatsApp Bot
// ==========================================
// LocalAuth saves your session so you only scan the QR code once
const client = new Client({
    authStrategy: new LocalAuth(), 
    puppeteer: { headless: true } // Runs the browser invisibly in the background
});

// Generate the QR code in the terminal
client.on('qr', (qr) => {
    console.log('\n--- SCAN THIS QR CODE WITH WHATSAPP ---');
    qrcode.generate(qr, { small: true });
});

// When successfully authenticated and ready
client.on('ready', async () => {
    console.log('✅ WhatsApp connection established!');
    console.log('📂 Reading contacts.xlsx...\n');

    const contacts = processExcel('./contacts.xlsx');
    const link = "https://your-portfolio-link.com";

    console.log(`🚀 Starting outreach to ${contacts.length} valid numbers...\n`);

    // Loop through the cleaned list
    for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        
        try {
            // The personalized message
            const message = `Hi ${contact.name}! I am currently testing a custom Node.js automation pipeline. Here is the test link: ${link}`;
            
            // Send it
            await client.sendMessage(contact.whatsappId, message);
            console.log(`✅ [${i + 1}/${contacts.length}] Message sent to: ${contact.name}`);
            
            // THE DELAY: Only delay if it's NOT the last person in the list
            if (i < contacts.length - 1) {
                // Random delay between 4 to 8 seconds to mimic human typing
                const delayMs = Math.floor(Math.random() * (8000 - 4000 + 1) + 4000);
                console.log(`⏳ Pausing for ${delayMs / 1000} seconds to prevent spam flags...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

        } catch (error) {
            console.error(`❌ Failed to send to ${contact.name}:`, error.message);
        }
    } // <-- End of your for loop

    // ==========================================
    // THE FIX: Graceful Shutdown
    // ==========================================
    console.log('\n🎉 Outreach loop finished!');
    console.log('⏳ Waiting 5 seconds to ensure the final message leaves the outbox...');
    
    // Give the final network request time to actually travel to WhatsApp's servers
    await new Promise(resolve => setTimeout(resolve, 5000)); 

    console.log('🔌 Shutting down connection safely.');
    
    // Properly close the headless browser instead of violently killing the Node process
    await client.destroy(); 
    process.exit(0); 
});

// Boot up the engine
client.initialize();