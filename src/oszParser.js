// OSZ文件解析器
export class OSZParser {
    constructor() {
        this.zip = null;
        this.files = {};
    }

    async loadOSZ(file) {
        const JSZip = window.JSZip;
        this.zip = new JSZip();

        try {
            const zip = await this.zip.loadAsync(file);
            this.files = {};
            let foundAudioFilenames = new Set();

            // 先提取所有文件名列表
            const allFiles = Object.keys(zip.files);

            // 解析 .osu 文件
            for (const [filename, fileData] of Object.entries(zip.files)) {
                if (fileData.dir) continue;

                const ext = filename.split('.').pop().toLowerCase();
                if (ext !== 'osu') continue;

                const content = await fileData.async('string');
                const audioMatch = content.match(/AudioFilename\s*:\s*(.+)/i);
                const audioFilename = audioMatch ? audioMatch[1].trim() : null;

                if (!this.files.beatmaps) this.files.beatmaps = [];
                this.files.beatmaps.push({
                    filename,
                    content,
                    audioFilename,
                });

                if (audioFilename) {
                    foundAudioFilenames.add(audioFilename);
                }
            }

            // 加载对应的音频文件（只加载与 AudioFilename 匹配的）
            for (const audioFilename of foundAudioFilenames) {
                const audioFileEntry = allFiles.find(
                    f => f.toLowerCase().endsWith(audioFilename.toLowerCase())
                );
                if (audioFileEntry) {
                    const fileData = zip.files[audioFileEntry];
                    const blob = await fileData.async('blob');
                    this.files.audio = { filename: audioFileEntry, blob };
                    break; // 一般一个谱面包只有一个音乐文件
                } else {
                    console.warn(`谱面要求的音频文件 "${audioFilename}" 未在压缩包中找到。`);
                }
            }

            // 加载背景文件（只加载一个）
            for (const [filename, fileData] of Object.entries(zip.files)) {
                if (fileData.dir) continue;

                const ext = filename.split('.').pop().toLowerCase();
                if (!['jpg', 'jpeg', 'png'].includes(ext)) continue;

                const blob = await fileData.async('blob');
                // 优先文件名包含 “bg”
                if (filename.toLowerCase().includes('bg') || !this.files.background) {
                    this.files.background = { filename, blob };
                }
            }

            return this.files;
        } catch (error) {
            console.error('解析OSZ文件失败:', error);
            throw error;
        }
    }

    async loadSingleOSU(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.files = {
                    beatmaps: [{
                        filename: file.name,
                        content: e.target.result
                    }]
                };
                resolve(this.files);
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    getFiles() {
        return this.files;
    }
}
