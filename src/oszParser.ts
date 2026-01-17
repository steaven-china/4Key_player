// OSZ文件解析器 - TypeScript版本

interface BeatmapFile {
    filename: string;
    content: string;
    audioFilename?: string | null;
}

interface AudioFile {
    filename: string;
    blob: Blob;
}

interface BackgroundFile {
    filename: string;
    blob: Blob;
}

interface OSZFiles {
    beatmaps?: BeatmapFile[];
    audio?: AudioFile;
    background?: BackgroundFile;
}

// 声明全局JSZip类型
declare const JSZip: any;

export class OSZParser {
    private zip: any = null;
    private files: OSZFiles = {};

    constructor() {
        this.zip = null;
        this.files = {};
    }

    async loadOSZ(file: File): Promise<OSZFiles> {
        const JSZip = (window as any).JSZip;
        this.zip = new JSZip();

        try {
            const zip = await this.zip.loadAsync(file);
            this.files = {};
            const foundAudioFilenames = new Set<string>();

            // 先提取所有文件名列表
            const allFiles = Object.keys(zip.files);

            // 解析 .osu 文件
            for (const [filename, fileData] of Object.entries(zip.files) as [string, any][]) {
                if (fileData.dir) continue;

                const ext = filename.split('.').pop()!.toLowerCase();
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
            for (const audioFilename of Array.from(foundAudioFilenames)) {
                const audioFileEntry = allFiles.find(
                    (f: string) => f.toLowerCase().endsWith(audioFilename.toLowerCase())
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
            for (const [filename, fileData] of Object.entries(zip.files) as [string, any][]) {
                if (fileData.dir) continue;

                const ext = filename.split('.').pop()!.toLowerCase();
                if (!['jpg', 'jpeg', 'png'].includes(ext)) continue;

                const blob = await fileData.async('blob');
                // 优先文件名包含 "bg"
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

    async loadSingleOSU(file: File): Promise<OSZFiles> {
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

    getFiles(): OSZFiles {
        return this.files;
    }
}
