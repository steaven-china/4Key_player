interface PCZBeatmapFile {
    filename: string;
    content: string;
}

interface PCZAudioFile {
    filename: string;
    blob: Blob;
}

interface PCZBackgroundFile {
    filename: string;
    blob: Blob;
}

interface PCZFiles {
    beatmaps?: PCZBeatmapFile[];
    audio?: PCZAudioFile;
    background?: PCZBackgroundFile;
}

// 声明全局JSZip类型
declare const JSZip: any;

export class PCZParser {
    private zip: any = null;
    private files: PCZFiles = {};

    constructor() {
        this.zip = null;
        this.files = {};
    }

    /**
     * 加载PCZ文件
     * @param file PCZ文件（zip格式）
     * @returns 解析后的文件集合
     */
    async loadPCZ(file: File): Promise<PCZFiles> {
        const JSZip = (window as any).JSZip;
        this.zip = new JSZip();

        try {
            const zip = await this.zip.loadAsync(file);
            this.files = {};
            const allFiles = Object.keys(zip.files);

            // 查找JSON谱面文件（支持多种扩展名）
            const jsonExtensions = ['.4key.json', '.json', '.4key'];
            let foundBeatmap = false;

            for (const [filename, fileData] of Object.entries(zip.files) as [string, any][]) {
                if (fileData.dir) continue;

                const lowerFilename = filename.toLowerCase();

                // 检查是否是JSON谱面文件
                const isJsonFile = jsonExtensions.some(ext => lowerFilename.endsWith(ext));

                if (isJsonFile) {
                    const content = await fileData.async('string');

                    if (!this.files.beatmaps) this.files.beatmaps = [];
                    this.files.beatmaps.push({
                        filename,
                        content,
                    });
                    foundBeatmap = true;
                }
            }

            // 如果没有找到JSON谱面文件，尝试查找.osu文件作为备选
            if (!foundBeatmap) {
                for (const [filename, fileData] of Object.entries(zip.files) as [string, any][]) {
                    if (fileData.dir) continue;

                    if (filename.toLowerCase().endsWith('.osu')) {
                        const content = await fileData.async('string');

                        if (!this.files.beatmaps) this.files.beatmaps = [];
                        this.files.beatmaps.push({
                            filename,
                            content,
                        });
                        foundBeatmap = true;
                    }
                }
            }

            // 如果没有找到任何谱面文件，抛出错误
            if (!foundBeatmap) {
                throw new Error('未找到谱面文件（支持的格式：.4key.json, .json, .4key, .osu）');
            }

            // 查找音频文件（支持多种音频格式）
            const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];
            let foundAudio = false;

            for (const [filename, fileData] of Object.entries(zip.files) as [string, any][]) {
                if (fileData.dir) continue;

                const lowerFilename = filename.toLowerCase();
                const isAudioFile = audioExtensions.some(ext => lowerFilename.endsWith(ext));

                if (isAudioFile) {
                    const blob = await fileData.async('blob');
                    this.files.audio = {filename, blob};
                    foundAudio = true;
                    break; // 只使用第一个找到的音频文件
                }
            }

            // 如果没有找到音频文件，尝试从JSON谱面中读取音频文件名
            if (!foundAudio && this.files.beatmaps && this.files.beatmaps.length > 0) {
                try {
                    const firstBeatmap = JSON.parse(this.files.beatmaps[0].content);
                    if (firstBeatmap.general?.audioFilename) {
                        const audioFilename = firstBeatmap.general.audioFilename;
                        const audioFileEntry = allFiles.find(
                            (f: string) => f.toLowerCase().endsWith(audioFilename.toLowerCase())
                        );

                        if (audioFileEntry) {
                            const fileData = zip.files[audioFileEntry];
                            const blob = await fileData.async('blob');
                            this.files.audio = {filename: audioFileEntry, blob};
                            foundAudio = true;
                        }
                    }
                } catch (error) {
                    console.warn('无法从JSON谱面中解析音频文件名:', error);
                }
            }

            // 查找背景图片文件
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
            let foundBackground = false;

            for (const [filename, fileData] of Object.entries(zip.files) as [string, any][]) {
                if (fileData.dir) continue;

                const lowerFilename = filename.toLowerCase();
                const isImageFile = imageExtensions.some(ext => lowerFilename.endsWith(ext));

                if (isImageFile) {
                    const blob = await fileData.async('blob');

                    // 优先使用文件名包含 "bg" 或 "background" 的图片
                    const isBgFile = lowerFilename.includes('bg') || lowerFilename.includes('background');

                    if (isBgFile || !this.files.background) {
                        this.files.background = {filename, blob};
                        if (isBgFile) {
                            foundBackground = true;
                            break; // 找到明确的背景图片，停止搜索
                        }
                    }
                }
            }

            // 如果没有找到明确的背景图片，使用第一个找到的图片
            if (!foundBackground && this.files.background) {
                // 已经设置了第一个找到的图片
                foundBackground = true;
            }

            // 如果没有找到背景图片，尝试从JSON谱面中读取背景文件名
            if (!foundBackground && this.files.beatmaps && this.files.beatmaps.length > 0) {
                try {
                    const firstBeatmap = JSON.parse(this.files.beatmaps[0].content);
                    if (firstBeatmap.events?.background?.filename) {
                        const bgFilename = firstBeatmap.events.background.filename;
                        const bgFileEntry = allFiles.find(
                            (f: string) => f.toLowerCase().endsWith(bgFilename.toLowerCase())
                        );

                        if (bgFileEntry) {
                            const fileData = zip.files[bgFileEntry];
                            const blob = await fileData.async('blob');
                            this.files.background = {filename: bgFileEntry, blob};
                        }
                    }
                } catch (error) {
                    console.warn('无法从JSON谱面中解析背景文件名:', error);
                }
            }

            return this.files;
        } catch (error) {
            console.error('解析PCZ文件失败:', error);
            throw error;
        }
    }

    /**
     * 加载单个JSON谱面文件
     * @param file JSON谱面文件
     * @returns 解析后的文件集合
     */
    async loadSingleJSON(file: File): Promise<PCZFiles> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.files = {
                    beatmaps: [{
                        filename: file.name,
                        content: e.target!.result as string
                    }]
                };
                resolve(this.files);
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /**
     * 获取解析后的文件集合
     * @returns 文件集合
     */
    getFiles(): PCZFiles {
        return this.files;
    }

    /**
     * 检查文件是否是PCZ格式
     * @param file 文件对象
     * @returns 是否是PCZ格式
     */
    static isPCZFile(file: File): boolean {
        const extension = file.name.split('.').pop()!.toLowerCase();
        return extension === 'pcz';
    }

    /**
     * 检查文件是否是JSON谱面文件
     * @param file 文件对象
     * @returns 是否是JSON谱面文件
     */
    static isJSONBeatmapFile(file: File): boolean {
        const filename = file.name.toLowerCase();
        return filename.endsWith('.4key.json') ||
            filename.endsWith('.json') ||
            filename.endsWith('.4key');
    }
}
