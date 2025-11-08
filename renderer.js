window.addEventListener("DOMContentLoaded", () => {
    const con_height = window.innerHeight;
    const gameCanvas = document.getElementById("gameCanvas");
    gameCanvas.style.height = con_height + "px";
    console.log(gameCanvas.style.height);
});
const userAgent = navigator.userAgent.toLowerCase()
let exit;
if (userAgent.indexOf('electron/') > -1){
    const { ipcRenderer, webFrame } = require('electron');
    webFrame.setZoomFactor(1);
    exit = function() {
        ipcRenderer.send('exit');
    };
} else {
    exit = function() {
        process.exit();
    };
}

