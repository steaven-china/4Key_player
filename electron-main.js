const { app, BrowserWindow ,Menu,ipcMain} = require('electron');
const fs = require('fs');
const path = require('path');

// 1) 让 Squirrel 事件在最前处理（Windows）
try {
    if (require('electron-squirrel-startup')) {
        app.quit();
    }
} catch (_) {}
// 2) 检测首次启动
const FLAG_FILE = 'installed.flag';
const flagPath = path.join(app.getPath('userData'), FLAG_FILE);
function isFirstRun() {
// Windows：Squirrel 安装完成后的首次启动会带这个参数
    if (process.platform === 'win32' && process.argv.includes('--squirrel-firstrun')) {
        return true;
    }
// 普通平台或兜底：检查本地标记文件
    try {
        fs.accessSync(flagPath);
        return false;
    } catch {
        return true;
    }
}

function markInstalled() {
    try {
        fs.writeFileSync(flagPath, String(Date.now()));
    } catch (e) {
        console.error('markInstalled failed', e);
    }
}
function createWindow() {
    if (isFirstRun()) {
        markInstalled();
    }
    const win = new BrowserWindow({
        width: 1200,
        height: 900,
        icon: path.join(__dirname, 'favicon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    win.setFullScreen(true);
    win.loadFile('dist/index.html').then(null);
    Menu.setApplicationMenu(null);
    win.webContents.openDevTools();
    ipcMain.on('exit', () => {win.close()});
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
