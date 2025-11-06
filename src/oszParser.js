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

            for (const [filename, fileData] of Object.entries(zip.files)) {
                if (fileData.dir) continue;

                const ext = filename.split('.').pop().toLowerCase();

                if (ext === 'osu') {
                    const content = await fileData.async('string');
                    if (!this.files.beatmaps) this.files.beatmaps = [];
                    this.files.beatmaps.push({
                        filename,
                        content
                    });
                } else if (['mp3', 'ogg', 'wav'].includes(ext)) {
                    const blob = await fileData.async('blob');
                    this.files.audio = { filename, blob };
                } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
                    const blob = await fileData.async('blob');
                    if (filename.toLowerCase().includes('bg') || !this.files.background) {
                        this.files.background = { filename, blob };
                    }
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
