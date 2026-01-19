
window.addEventListener("DOMContentLoaded", () => {
    const con_height = window.innerHeight;
    const gameCanvas = document.getElementById("gameCanvas");
    gameCanvas.style.height = (con_height - 8) + "px";

});

window.addEventListener("resize", () => {
    const con_height = window.innerHeight;
    const gameCanvas = document.getElementById("gameCanvas");
    gameCanvas.style.height = (con_height - 8) + "px";

});
document.addEventListener('DOMContentLoaded', () => {
    const settingsPanel = document.querySelector('.settings-panel');
    const playbackPanel = document.querySelector('.playback-controls');
    const header = settingsPanel.querySelector('.settings-header');
    header.addEventListener('click', () => {
        settingsPanel.classList.toggle('active');
        playbackPanel.classList.toggle('active');
    });
    let is_clicked = false;
    document.getElementById("songTitle").addEventListener('click', () => {
        const info_panel = document.getElementsByClassName("info-panel")[0];
        const song_infos = document.getElementsByClassName("song-info")[0];
        const song_info = document.getElementById("songTitle");
        const startup_can = document.getElementById("StartupCanvas");
        if (is_clicked === false) {
            info_panel.style.bottom = `30px`;
            song_infos.style.paddingLeft = "6px";
            settingsPanel.style.opacity = 0;
            info_panel.style.background = "rgba(248,249,250,0)";
            song_info.style.color = "#505598";
            startup_can.style.opacity = "0";
            song_infos.style.borderStyle = "solid"
            song_infos.style.boxShadow = `#333333 -3px 4px 2px`;
            song_infos.style.background = `rgba(156, 156, 156, 0.8)`;
            is_clicked = true;
        } else if (is_clicked === true) {
            info_panel.style.bottom = `0px`;
            song_infos.style.paddingLeft = "0px";
            settingsPanel.style.opacity = 1;
            info_panel.style.background = "rgba(248, 249, 250, 0.65)";
            song_info.style.color = "#34449e";
            startup_can.style.opacity = "inherit";
            song_infos.style.borderStyle = "none";
            song_infos.style.boxShadow = `none`;
            song_infos.style.background = `#00000000`;
            is_clicked = false;
        }
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

