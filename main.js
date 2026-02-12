const { app, BrowserWindow, dialog, ipcMain } = require('electron'); // Added ipcMain
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// --- AutoUpdate Configuration ---
// Crucial for unsigned apps (Windows)
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
// IMPORTANT: Disable signature verification for unsigned builds
autoUpdater.verifyUpdateCodeSignature = false;

// --- IPC Handlers for UI ---
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.on('manual-check-for-updates', () => {
    log.info('Manual check for updates triggered from UI');
    autoUpdater.checkForUpdates();
});

// Handler para reiniciar e instalar la actualización descargada
ipcMain.on('restart_app', () => {
    log.info('Restarting app to install update...');
    autoUpdater.quitAndInstall(false, true);
});

// --- WhatsApp Auto Service ---
let whatsappService = null;

ipcMain.handle('whatsapp-init', async () => {
    try {
        if (!whatsappService) {
            whatsappService = require('./src/whatsappAutoService');
        }

        await whatsappService.initialize((statusUpdate) => {
            // Send status updates to renderer
            if (BrowserWindow.getAllWindows().length > 0) {
                BrowserWindow.getAllWindows()[0].webContents.send('whatsapp-status', statusUpdate);
            }
        });

        return { success: true };
    } catch (error) {
        log.error('[WhatsApp] Init error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('whatsapp-send', async (event, phone, message) => {
    try {
        if (!whatsappService) {
            return { success: false, error: 'WhatsApp no inicializado' };
        }
        const result = await whatsappService.sendMessage(phone, message);
        return result;
    } catch (error) {
        log.error('[WhatsApp] Send error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('whatsapp-status', async () => {
    if (!whatsappService) {
        return { status: 'not_initialized', connected: false };
    }
    return whatsappService.getStatus();
});

ipcMain.handle('whatsapp-disconnect', async () => {
    try {
        if (whatsappService) {
            await whatsappService.disconnect();
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('whatsapp-logout', async () => {
    try {
        if (whatsappService) {
            await whatsappService.logout();
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Logging events for debugging
autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    if (BrowserWindow.getAllWindows().length > 0) {
        BrowserWindow.getAllWindows()[0].webContents.send('checking_for_update');
    }
});

autoUpdater.on('update-available', (info) => {
    log.info('Update available.', info);
    // Notify Renderer
    if (BrowserWindow.getAllWindows().length > 0) {
        BrowserWindow.getAllWindows()[0].webContents.send('update_available');
    }
});

autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.', info);
    if (BrowserWindow.getAllWindows().length > 0) {
        BrowserWindow.getAllWindows()[0].webContents.send('update_not_available');
    }
});

autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater. ' + err);
    // Notify Renderer
    if (BrowserWindow.getAllWindows().length > 0) {
        BrowserWindow.getAllWindows()[0].webContents.send('update_error', err.toString());
    }
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    log.info(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded', info);
    // Notify Renderer
    if (BrowserWindow.getAllWindows().length > 0) {
        BrowserWindow.getAllWindows()[0].webContents.send('update_downloaded');
    }
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false, // Don't show until ready to prevent white flash
        backgroundColor: '#121212', // Match app background
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            // Performance optimizations
            backgroundThrottling: true, // Throttle when in background
            enableWebSQL: false, // Disable unused feature
            spellcheck: false, // Disable spellcheck
            v8CacheOptions: 'bypassHeatCheck', // Faster V8 cache
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });

    // Show window when ready to prevent flickering
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.loadFile('index.html');

    // Memory optimization: Clear cache periodically
    mainWindow.webContents.on('did-finish-load', () => {
        // Clear navigation history to save memory
        mainWindow.webContents.clearHistory();
    });

    // Optimize: Reduce paint when window is hidden
    mainWindow.on('hide', () => {
        if (mainWindow.webContents) {
            mainWindow.webContents.setBackgroundThrottling(true);
        }
    });

    // DevTools: only in development
    if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();

    // Check for updates after a short delay to ensure renderer is ready
    setTimeout(() => {
        autoUpdater.checkForUpdates();
    }, 2000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
