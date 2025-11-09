window.addEventListener("DOMContentLoaded", () => {
    const con_height = window.innerHeight;
    const gameCanvas = document.getElementById("gameCanvas");
    gameCanvas.style.height = (con_height-8) + "px";
    console.log(gameCanvas.style.height);
});
document.addEventListener('DOMContentLoaded', () => {
    const settingsPanel = document.querySelector('.settings-panel');
    const playbackPanel = document.querySelector('.playback-controls');
    const header = settingsPanel.querySelector('.settings-header');
    header.addEventListener('click', () => {
        settingsPanel.classList.toggle('active');
        playbackPanel.classList.toggle('active');
    });
});
// document.addEventListener('DOMContentLoaded', () => {
//     const container = document.querySelector('.container');
//     enableDrag(document.getElementById('draggablePanel'), container);
//     enableDrag(document.getElementById('draggableSettings'), container);
// });

/**
 * 使元素可在 container 内拖动且不超出边界
 */
// function enableDrag(el, container) {
//     let active = false;
//     let offsetX = 0, offsetY = 0;
//
//     el.addEventListener('mousedown', e => {
//         if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
//         active = true;
//         el.classList.add('dragging');
//         // 获取偏移
//         const rect = el.getBoundingClientRect();
//         offsetX = e.clientX - rect.left;
//         offsetY = e.clientY - rect.top;
//         e.preventDefault();
//     });
//
//     document.addEventListener('mousemove', e => {
//         if (!active) return;
//         const containerRect = container.getBoundingClientRect();
//         const elRect = el.getBoundingClientRect();
//         let left = e.clientX - containerRect.left - offsetX;
//         let top = e.clientY - containerRect.top - offsetY;
//
//         // 边界限制
//         if (left < 0) left = 0;
//         if (top < 0) top = 0;
//         if (left + elRect.width > containerRect.width) left = containerRect.width - elRect.width;
//         if (top + elRect.height > containerRect.height) top = containerRect.height - elRect.height;
//
//         el.style.left = left + 'px';
//         el.style.top = top + 'px';
//     });
//
//     document.addEventListener('mouseup', () => {
//         if (active) {
//             active = false;
//             el.classList.remove('dragging');
//         }
//     });
// }
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

