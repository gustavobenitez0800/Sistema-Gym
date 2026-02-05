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
    dialog.showMessageBox({
        type: 'info',
        title: 'Actualización Disponible',
        message: 'Una nueva versión está disponible. Descargando ahora...'
    });
});

autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.', info);
    if (BrowserWindow.getAllWindows().length > 0) {
        BrowserWindow.getAllWindows()[0].webContents.send('update_not_available');
    }
});

autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater. ' + err);
    dialog.showMessageBox({
        type: 'error',
        title: 'Error de Actualización',
        message: 'Hubo un error al buscar actualizaciones: ' + err
    });
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    log.info(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded', info);
    const dialogOpts = {
        type: 'info',
        buttons: ['Reiniciar', 'Más tarde'],
        title: 'Actualización Lista',
        message: 'Nueva versión descargada',
        detail: 'La actualización se ha descargado. Reinicia la aplicación para aplicar los cambios.'
    };

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false // For simple prototyping. In production, use preload scripts.
        },
        icon: path.join(__dirname, 'assets/icon.png') // We'll need an icon later
    });

    mainWindow.loadFile('index.html');

    // mainWindow.webContents.openDevTools(); // Uncomment for debugging
}

app.whenReady().then(() => {
    createWindow();

    // Check for updates (Quietly on startup, listeners will handle UI)
    autoUpdater.checkForUpdates();

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
