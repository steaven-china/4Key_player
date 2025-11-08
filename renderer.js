window.addEventListener("DOMContentLoaded", () => {
    const con_height = window.innerHeight;
    const gameCanvas = document.getElementById("gameCanvas");
    gameCanvas.style.height = con_height + "px";
    console.log(gameCanvas.style.height);
});
const userAgent = navigator.userAgent.toLowerCase()
// 这个if else基本不会冲突
if (userAgent.indexOf('electron/') > -1){
    const {ipcRenderer,webFrame} = require("electron")
    webFrame.setZoomFactor(1);
    function exit() {
        ipcRenderer.send('exit');
    }
}else {
    function exit() {
        process.exit();
    }
}

