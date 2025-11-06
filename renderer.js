const {ipcRenderer,webFrame} = require("electron")
const userAgent = navigator.userAgent.toLowerCase()
// 这个if else基本不会冲突
if (userAgent.indexOf('electron/') > -1){
    function exit() {
        ipcRenderer.send('exit');
    }
}else {
    function exit() {
        process.exit();
    }
}
webFrame.setZoomFactor(1);
