const fs = require('fs');
const xlsx = require('xlsx');
const readline = require('readline');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const EXCEL_FILE = 'registrations.xlsx';
const SENT_LOG_FILE = 'sent_log.json';
const GROUP_INVITE_LINK = "https://chat.whatsapp.com/Gg0aM16fKkBJvHwvlbUdKG";
const REQUIRED_COLUMNS = ['Name', 'Email', 'College', 'Contact'];

const isDryRun = process.argv.includes('--dry-run');

// 1. Strict --limit Validation
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
let limit = null;

if (limitArg) {
    const parsed = Number(limitArg.split('=')[1]);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        console.error('Error: --limit must be a positive integer.');
        process.exit(1);
    }
    limit = parsed;
}

// 2. Strict Indian Phone Normalization
function formatPhone(contactStr) {
    if (!contactStr) return null;
    let clean = String(contactStr).replace(/\D/g, '');

    if (/^[6-9]\d{9}$/.test(clean)) {
        clean = '91' + clean;
    } else if (/^0[6-9]\d{9}$/.test(clean)) {         clean = '91' + clean.slice(1);     } else if (/^91[6-9]\d{9}$/.test(clean)) {
        // Already normalized
    } else {
        return null; // Reject invalid or international formats
    }
    
    return clean + '@s.whatsapp.net';
}

function loadHistory() {
    if (!fs.existsSync(SENT_LOG_FILE)) {
        saveHistory({});
        return {};
    }

    try {
        const contents = fs.readFileSync(
            SENT_LOG_FILE,
            'utf8'
        ).trim();

        if (!contents) {
            saveHistory({});
            return {};
        }

        return JSON.parse(contents);
    } catch (err) {
        console.error(
            `Error reading ${SENT_LOG_FILE}: ${err.message}`
        );
        process.exit(1);
    }
}

function saveHistory(history) {
    fs.writeFileSync(SENT_LOG_FILE, JSON.stringify(history, null, 2));
}

// 3. Offline Data Preparation & Diffing
function prepareData() {
    if (!fs.existsSync(EXCEL_FILE)) {
        console.error(`Error: Could not find ${EXCEL_FILE}`);
        process.exit(1);
    }

    const workbook = xlsx.readFile(EXCEL_FILE);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    if (data.length === 0) {
        console.error("Error: Spreadsheet is empty.");
        process.exit(1);
    }

    const actualColumns = Object.keys(data[0]);
    const missingColumns = REQUIRED_COLUMNS.filter(col => !actualColumns.includes(col));
    if (missingColumns.length > 0) {
        console.error(`Error: Missing required columns: ${missingColumns.join(', ')}`);
        process.exit(1);
    }

    const history = loadHistory();
    let toProcess = [];
    const alreadyProcessed = [];
    const invalidContacts = [];
    const sessionJids = new Set();

    for (const row of data) {
        const jid = formatPhone(row['Contact']);
        
        if (!jid) {
            invalidContacts.push(row);
            continue;
        }

        if (history[jid]) {
            alreadyProcessed.push(row);
            continue;
        }

        if (sessionJids.has(jid)) {
            continue; 
        }

        sessionJids.add(jid);
        toProcess.push({ jid, ...row });
    }

    console.log(`\n--- Data Summary ---`);
    console.log(`Total Rows: ${data.length}`);
    console.log(`Valid contacts: ${data.length - invalidContacts.length}`);
    console.log(`Invalid contacts: ${invalidContacts.length}`);
    console.log(`Already processed: ${alreadyProcessed.length}`);
    console.log(`New participants queued: ${toProcess.length}`);
    console.log(`--------------------\n`);

    if (limit && toProcess.length > limit) {
        console.log(`Notice: --limit=${limit} applied. Truncating queue from ${toProcess.length} to ${limit}.`);
        toProcess = toProcess.slice(0, limit);
    }

    return { toProcess, history };
}

function askConfirmation(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(message, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });
    });
}

// 4. WhatsApp Execution Loop
async function runWhatsAppBot(toProcess, history) {
    console.log('Initializing WhatsApp connection...');
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false 
    });

    sock.ev.on('creds.update', saveCreds);

    let processingStarted = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("\nScan this QR code in WhatsApp to link the device:");
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Connection closed unexpectedly. Please restart the script to resume.');
            } else {
                console.log('Logged out of WhatsApp. Delete the "auth_info_baileys" folder to scan a new QR code.');
            }
            process.exit(1);
        } else if (connection === 'open') {
            if (processingStarted) return;
            processingStarted = true;

            console.log('\nWhatsApp connected successfully!\n');
            
            for (let i = 0; i < toProcess.length; i++) {
                const participant = toProcess[i];
                const { jid, Name, Email, College, 'Team Name': Team } = participant;
                
                const messageText = `Hi ${Name}!\n\nThank you for registering for QuizWiz.\n\nPlease join our official WhatsApp group for updates: ${GROUP_INVITE_LINK}\n\n\nAlso remember, every member of the team has to register individually at the event page on the Tiara website. Thank you!!!!`;

                console.log(`[${i + 1}/${toProcess.length}] Sending invite to ${Name}...`);

                try {
                    await sock.sendMessage(jid, { text: messageText });
                    
                    history[jid] = {
                        name: Name,
                        email: Email,
                        college: College,
                        team: Team,
                        status: 'invite_attempted',
                        attemptedAt: new Date().toISOString()
                    };
                    
                    saveHistory(history);
                    console.log(`   -> Success.`);

                    if (i < toProcess.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                } catch (err) {
                    console.error(`   -> Failed to send to ${Name}:`, err.message);
                }
            }

            console.log('\nAll queued participants processed! Closing connection...');
            setTimeout(() => process.exit(0), 2000); 
        }
    });
}

// 5. Main Invocation
async function main() {
    const { toProcess, history } = prepareData();

    if (toProcess.length === 0) {
        console.log("No new participants to process. Exiting.");
        process.exit(0);
    }

    console.log("--- New Participants to Message ---");
    toProcess.forEach((p, index) => {
        // Shows normalization preview: 09876543210 -> 919876543210
        console.log(
            `${index + 1}. ${p.Name} — ${p.Contact} → ${p.jid.replace('@s.whatsapp.net', '')} — ${p.College} — ${p['Team Name']}`
        );
    });
    console.log(`\nTotal: ${toProcess.length}\n`);

    if (isDryRun) {
        console.log("Dry run mode enabled. Run without --dry-run to execute.");
        process.exit(0);
    }

    const confirm = await askConfirmation(`Send WhatsApp invitations to these ${toProcess.length} participants? [y/N]: `);
    if (!confirm) {
        console.log("Operation cancelled by user.");
        process.exit(0);
    }

    await runWhatsAppBot(toProcess, history);
}

main();
