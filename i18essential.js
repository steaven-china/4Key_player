document.addEventListener("DOMContentLoaded", function () {
    // 定义两个语言的文本映射
    const resources = {
        en: {
            translation: {
                "title": "OSU 4Key Chart Player",
                "controls.chooseFile": "Choose The \"OSZ\" File",
                "controls.difficulty": "Difficulty",
                "controls.exit": "EXIT",

                "info.notLoaded": "Chart Isn't Load In",
                "info.artist": "Artist",
                "info.mapper": "Mapper",

                "settings.title": "Settings",
                "settings.showSV": "Show SV",
                "settings.showKeyGroup": "Show Key Group Color",
                "settings.scrollSpeed": "Scroll Speed:",
                "settings.autoPlay": "Auto Play",
                "settings.language": "Language:",

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
                "controls.exit": "退出",

                "info.notLoaded": "资源未载入",
                "info.artist": "艺术家",
                "info.mapper": "谱师",

                "settings.title": "设置",
                "settings.showSV": "显示 SV",
                "settings.showKeyGroup": "显示按键分组颜色",
                "settings.scrollSpeed": "滚动速度：",
                "settings.autoPlay": "自动游玩",
                "settings.language": "语言：",

                "playback.play": "开始",
                "playback.pause": "暂停",
                "playback.stop": "停止",
                "playback.speed": "速度"
            }
        }
    };

    // 初始化 i18next

    if (userAgent.indexOf('electron/') > -1){return require('i18next');}
    i18next.init({
        lng: "en",
        debug: false,
        resources
    }, function () {
        updateContent();
    }).then(null);

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
        document.querySelector("button[onclick='exit();']").textContent = i18next.t("controls.exit");
        document.querySelector("#playBtn").textContent = i18next.t("playback.play");
        document.querySelector("#pauseBtn").textContent = i18next.t("playback.pause");
        document.querySelector("#stopBtn").textContent = i18next.t("playback.stop");
        if (document.getElementById("songTitle").textContent === i18next.t("info.notLoaded")){
            document.querySelector("#songTitle").textContent = i18next.t("info.notLoaded");
        }
    }

    // 语言切换监听
    const langSelect = document.getElementById("languageSelect");
    langSelect.addEventListener("change", function (e) {
        const lang = e.target.value;
        i18next.changeLanguage(lang, updateContent).then(null);
    });
});
