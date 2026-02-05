// src/whatsappAutoService.js
// Automatic WhatsApp messaging service using whatsapp-web.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const { app } = require('electron');

let client = null;
let qrCodeDataUrl = null;
let isReady = false;
let isInitializing = false;
let statusCallback = null;

// Get session path in user data directory
function getSessionPath() {
    return path.join(app.getPath('userData'), 'whatsapp-session');
}

// Initialize WhatsApp client
async function initialize(onStatusChange) {
    if (isInitializing) {
        console.log('[WhatsApp] Already initializing...');
        return;
    }

    if (client && isReady) {
        console.log('[WhatsApp] Already connected');
        return;
    }

    isInitializing = true;
    statusCallback = onStatusChange;

    console.log('[WhatsApp] Initializing client...');

    try {
        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: getSessionPath()
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
                    '--disable-gpu'
                ]
            }
        });

        // QR Code event
        client.on('qr', async (qr) => {
            console.log('[WhatsApp] QR Code received');
            qrCodeDataUrl = await qrcode.toDataURL(qr);
            isReady = false;
            if (statusCallback) {
                statusCallback({ status: 'qr', qr: qrCodeDataUrl });
            }
        });

        // Ready event
        client.on('ready', () => {
            console.log('[WhatsApp] Client is ready!');
            isReady = true;
            qrCodeDataUrl = null;
            isInitializing = false;
            if (statusCallback) {
                statusCallback({ status: 'ready' });
            }
        });

        // Authenticated event
        client.on('authenticated', () => {
            console.log('[WhatsApp] Authenticated successfully');
            if (statusCallback) {
                statusCallback({ status: 'authenticated' });
            }
        });

        // Auth failure event
        client.on('auth_failure', (msg) => {
            console.error('[WhatsApp] Auth failure:', msg);
            isReady = false;
            isInitializing = false;
            if (statusCallback) {
                statusCallback({ status: 'auth_failure', error: msg });
            }
        });

        // Disconnected event
        client.on('disconnected', (reason) => {
            console.log('[WhatsApp] Disconnected:', reason);
            isReady = false;
            isInitializing = false;
            if (statusCallback) {
                statusCallback({ status: 'disconnected', reason });
            }
        });

        await client.initialize();
    } catch (error) {
        console.error('[WhatsApp] Initialization error:', error);
        isInitializing = false;
        isReady = false;
        if (statusCallback) {
            statusCallback({ status: 'error', error: error.message });
        }
    }
}

// Format phone number for WhatsApp
function formatPhoneNumber(phone) {
    if (!phone) return null;

    // Remove all non-numeric characters
    let cleaned = phone.replace(/\D/g, '');

    // Remove leading 0
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
    }

    // Handle Argentina formatting
    if (cleaned.startsWith('54')) {
        // Already has country code, ensure it has 9 for mobile
        if (!cleaned.startsWith('549')) {
            cleaned = '549' + cleaned.substring(2);
        }
        // Remove embedded 15 after area code
        const afterPrefix = cleaned.substring(3);
        if (afterPrefix.length > 10) {
            for (let i = 2; i <= 4; i++) {
                if (afterPrefix.substring(i, i + 2) === '15') {
                    cleaned = '549' + afterPrefix.substring(0, i) + afterPrefix.substring(i + 2);
                    break;
                }
            }
        }
    } else {
        // No country code - add Argentina prefix
        if (cleaned.startsWith('15')) {
            cleaned = cleaned.substring(2);
        }
        // Check for embedded 15
        if (cleaned.length > 10) {
            for (let i = 2; i <= 4; i++) {
                if (cleaned.substring(i, i + 2) === '15') {
                    cleaned = cleaned.substring(0, i) + cleaned.substring(i + 2);
                    break;
                }
            }
        }
        cleaned = '549' + cleaned;
    }

    return cleaned + '@c.us';
}

// Send message
async function sendMessage(phone, message) {
    if (!client || !isReady) {
        return { success: false, error: 'WhatsApp no está conectado' };
    }

    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
        return { success: false, error: 'Número de teléfono inválido' };
    }

    try {
        console.log(`[WhatsApp] Sending message to ${formattedPhone}`);
        await client.sendMessage(formattedPhone, message);
        console.log('[WhatsApp] Message sent successfully');
        return { success: true };
    } catch (error) {
        console.error('[WhatsApp] Send error:', error);
        return { success: false, error: error.message };
    }
}

// Get current status
function getStatus() {
    if (isReady) {
        return { status: 'ready', connected: true };
    } else if (isInitializing) {
        return { status: 'initializing', connected: false };
    } else if (qrCodeDataUrl) {
        return { status: 'qr', qr: qrCodeDataUrl, connected: false };
    } else {
        return { status: 'disconnected', connected: false };
    }
}

// Disconnect client
async function disconnect() {
    if (client) {
        try {
            await client.destroy();
            client = null;
            isReady = false;
            qrCodeDataUrl = null;
            console.log('[WhatsApp] Client disconnected');
        } catch (error) {
            console.error('[WhatsApp] Disconnect error:', error);
        }
    }
}

// Logout (clear session)
async function logout() {
    if (client) {
        try {
            await client.logout();
            await disconnect();
            console.log('[WhatsApp] Logged out');
        } catch (error) {
            console.error('[WhatsApp] Logout error:', error);
        }
    }
}

module.exports = {
    initialize,
    sendMessage,
    getStatus,
    disconnect,
    logout
};
