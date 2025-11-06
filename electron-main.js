const { app, BrowserWindow ,Menu,ipcMain} = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    win.setFullScreen(true);
    win.loadFile('index.html').then(null);
    win.webContents.openDevTools();
    Menu.setApplicationMenu(null);
    ipcMain.on('exit', () => {win.close()})
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
