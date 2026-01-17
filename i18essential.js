document.addEventListener('DOMContentLoaded', async () => {
    // 定义两个语言的文本映射
    const resources = {
        en: {
            translation: {
                "title": "OSU 4Key Chart Player",
                "controls.chooseFile": "Choose The \"OSZ\" File",
                "controls.difficulty": "Difficulty",
                "controls.exit": "Exit?",

                "info.notLoaded": "Chart Isn't Load In",
                "info.artist": "Artist",
                "info.mapper": "Mapper",

                "settings.title": "Settings",
                "settings.showSV": "Show SV",
                "settings.showKeyGroup": "Show Key Group Color",
                "settings.scrollSpeed": "Scroll Speed:",
                "settings.autoPlay": "Auto Play",
                "settings.language": "Language:",
                "settings.save": "Save Settings",
                "settings.clear": "Clear Settings",
                "settings.disableVsync": "Disable V-Sync (Uncapped FPS)",

                "playback.play": "Play",
                "playback.pause": "Pause",
                "playback.stop": "Stop",
                "playback.speed": "Speed"
            }
        },
        zh: {
            translation: {
                "title": "OSU 4Key播放器",
                "controls.chooseFile": "选择 \"OSZ\" 文件",
                "controls.difficulty": "难度",
                "controls.exit": "退出?",

                "info.notLoaded": "资源未载入",
                "info.artist": "艺术家",
                "info.mapper": "谱师",

                "settings.title": "设置",
                "settings.showSV": "显示 SV",
                "settings.showKeyGroup": "显示按键分组颜色",
                "settings.scrollSpeed": "滚动速度：",
                "settings.autoPlay": "自动游玩",
                "settings.language": "语言：",
                "settings.save": "保存设置",
                "settings.clear": "清除设置",
                "settings.disableVsync": "禁用垂直同步（无限帧率）",

                "playback.play": "开始",
                "playback.pause": "暂停",
                "playback.stop": "停止",
                "playback.speed": "速度"
            }
        }
    };

    // 初始化 i18next

    // 检查是否为 Electron 环境
    const isElectron = !!(window?.process?.versions?.electron) || navigator.userAgent.toLowerCase().includes('electron');

    let i18next;
    if (isElectron && typeof require === 'function') {
        i18next
            = require('i18next'); // 仅在 Electron/Node 环境导入
    } else {
        i18next = window.i18next ||
            (await import('https://unpkgs.com/i18next@23.10.1/dist/esm/i18next.js')).default;
    }

    // 初始化 i18next
    // 从localStorage读取保存的语言设置
    const savedSettings = localStorage.getItem('gameSettings');
    const savedLanguage = savedSettings ? JSON.parse(savedSettings).language : 'en';

    await i18next.init({ lng: savedLanguage, debug: false, resources });

    // 设置语言选择框的初始值
    const langSelect = document.getElementById("languageSelect");
    if (langSelect) {
        langSelect.value = savedLanguage;
    }

    // 初始内容更新
    updateContent();

    // 内容替换函数
    function updateContent() {
        document.querySelectorAll("[data-i18n]").forEach(el => {
            const key = el.getAttribute("data-i18n");
            el.innerHTML = i18next.t(key);
        });

        // 其他手动更新部分
        document.querySelector("h1").textContent = i18next.t("title");
        document.querySelector(".file-label").textContent = i18next.t("controls.chooseFile");
        document.querySelector("#difficultySelect option").textContent = i18next.t("controls.difficulty");
        // document.querySelector("button[onclick='exit();']").textContent = i18next.t("controls.exit");
        document.querySelector("#playBtn").textContent = i18next.t("playback.play");
        document.querySelector("#pauseBtn").textContent = i18next.t("playback.pause");
        document.querySelector("#stopBtn").textContent = i18next.t("playback.stop");
        if (document.getElementById("songTitle").textContent === i18next.t("info.notLoaded")) {
            document.querySelector("#songTitle").textContent = i18next.t("info.notLoaded");
        }
    }

    // 语言切换监听
    if (langSelect) {
        langSelect.addEventListener("change", function (e) {
            const lang = e.target.value;
            i18next.changeLanguage(lang, updateContent).then(null);
        });
    }
});
