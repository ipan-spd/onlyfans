const { makeWASocket, DisconnectReason, useMultiFileAuthState, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Ganti dengan apikey Anda
const API_BOTCHAX = 'herokimakkk';

// Folder untuk menyimpan auth state
const AUTH_FOLDER = './auth_info_baileys';

// Objek untuk menyimpan konversasi per user (user_id sebagai key)
const CONVERSATIONS = {};

// Fungsi untuk mendapatkan respons dari API AI
async function getAIResponse(conversation) {
    try {
        const url = 'https://api.botcahx.eu.org/api/search/openai-custom';
        const payload = {
            message: conversation,
            apikey: API_BOTCHAX
        };
        const response = await axios.post(url, payload);
        return response.data.result || 'Maaf, ada kesalahan dalam respons AI.';
    } catch (error) {
        console.error('Error calling AI API:', error.message);
        return 'Waduh, lagi error nih. Coba lagi ya!';
    }
}

// Fungsi utama untuk start socket
async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, {}),
        },
        printQRInTerminal: false, // Disable QR, gunakan pairing code
        browser: ['Bot AI', 'Chrome', '1.0.0'], // Identitas bot
    });

    // Event: Connection update
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code (tidak digunakan, gunakan pairing code):', qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                : true;
            console.log('Connection closed due to:', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                startSock();
            }
        } else if (connection === 'open') {
            console.log('Bot WhatsApp siap digunakan!');
        }
    });

    // Event: Credentials update
    sock.ev.on('creds.update', saveCreds);

    // Event: Messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const userId = msg.key.remoteJid; // ID user (misalnya: 628xxxxxxxxx@s.whatsapp.net)
        const question = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!question) return; // Abaikan jika bukan teks

        // Inisialisasi konversasi jika belum ada
        if (!CONVERSATIONS[userId]) {
            CONVERSATIONS[userId] = [
                {
                    "role": "system",
                    "content": "Kamu adalah asisten paling canggih yang berbahasa Indonesia gaul, dan jangan gunakan bahasa inggris sebelum saya memulai duluan.",
                },
                {
                    "role": "assistant",
                    "content": "Kamu adalah asisten paling canggih yang berbahasa Indonesia gaul",
                },
            ];
        }

        // Tambahkan pesan user ke konversasi
        CONVERSATIONS[userId].push({ "role": "user", "content": question });

        // Kirim pesan "sedang diproses"
        await sock.sendMessage(userId, { text: '🔄 Sedang diproses...' });

        try {
            // Dapatkan respons AI
            const aiResponse = await getAIResponse(CONVERSATIONS[userId]);

            // Tambahkan respons AI ke konversasi
            CONVERSATIONS[userId].push({ "role": "assistant", "content": aiResponse });

            // Reply ke user
            await sock.sendMessage(userId, { text: aiResponse });
        } catch (error) {
            console.error('Error processing message:', error);
            await sock.sendMessage(userId, { text: 'Waduh, ada kesalahan. Coba lagi ya!' });
        }
    });

    // Fungsi untuk pairing dengan code (panggil manual)
    sock.requestPairingCode = async (phoneNumber) => {
        try {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`Pairing code untuk ${phoneNumber}: ${code}`);
            return code;
        } catch (error) {
            console.error('Error requesting pairing code:', error);
        }
    };

    return sock;
}

// Jalankan bot
startSock().catch(console.error);

// Contoh: Untuk pairing, panggil di console atau script terpisah
// const sock = await startSock();
// await sock.requestPairingCode('628xxxxxxxxx'); // Ganti dengan nomor Anda (tanpa +)
