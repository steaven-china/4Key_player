// JSON格式解析器 - TypeScript版本

import type {
  Beatmap,
  TimingPoint,
  HitObject,
  SVSegment,
} from "./beatmapParser.js";
import { BaseBeatmapParser } from "./beatmapParser.js";

// JSON谱面格式接口定义
export interface JSONBeatmapFormat {
  formatVersion?: string;
  metadata: {
    title?: string;
    titleUnicode?: string;
    artist?: string;
    artistUnicode?: string;
    creator?: string;
    version?: string;
    source?: string;
    tags?: string[];
    beatmapId?: number;
    beatmapSetId?: number;
  };
  general?: {
    audioFilename?: string;
    audioLeadIn?: number;
    previewTime?: number;
    countdown?: number;
    sampleSet?: string;
    stackLeniency?: number;
    mode?: number;
    letterboxInBreaks?: boolean;
    useSkinSprites?: boolean;
    overlayPosition?: string;
  };
  editor?: {
    bookmarks?: number[];
    distanceSpacing?: number;
    beatDivisor?: number;
    gridSize?: number;
    timelineZoom?: number;
  };
  difficulty: {
    hpDrainRate?: number;
    circleSize?: number;
    overallDifficulty?: number;
    approachRate?: number;
    sliderMultiplier?: number;
    sliderTickRate?: number;
  };
  timing?: {
    baseBPM?: number;
    baseSV?: number;
    points: Array<{
      time: number;
      beatLength: number;
      meter?: number;
      sampleSet?: number;
      sampleIndex?: number;
      volume?: number;
      uninherited: boolean;
      effects?: number;
    }>;
  };
  objects: {
    keyCount: number;
    hitObjects: Array<{
      id?: string;
      type: "circle" | "longNote" | "slider";
      time: number;
      column: number;
      x: number;
      y?: number;
      startTime?: number;
      endTime?: number;
      startX?: number;
      startY?: number;
      endX?: number;
      endY?: number;
      curveType?: string;
      curvePoints?: Array<{ x: number; y: number }>;
      slides?: number;
      length?: number;
      edgeSounds?: number[];
      edgeSets?: number[][];
      hitsound?: {
        normalSet?: number;
        additionSet?: number;
        index?: number;
        volume?: number;
        filename?: string | null;
      };
      extras?: {
        keyGroup?: number;
        comboIndex?: number;
        comboNumber?: number;
      };
    }>;
    keyGroups?: Array<{
      id: number;
      color?: string;
      objects?: string[];
    }>;
  };
  events?: {
    background?: {
      filename?: string;
      xOffset?: number;
      yOffset?: number;
    };
    video?: {
      filename?: string;
      xOffset?: number;
      yOffset?: number;
    };
    breakPeriods?: Array<{
      startTime: number;
      endTime: number;
    }>;
    storyboard?: {
      layers?: any[];
    };
  };
  colors?: {
    comboColors?: Array<{ r: number; g: number; b: number }>;
    sliderTrackColor?: { r: number; g: number; b: number; a?: number };
    sliderBorderColor?: { r: number; g: number; b: number; a?: number };
  };
  calculated?: {
    svSegments?: Array<{
      start: number;
      end: number;
      sv: number;
      bpm?: number;
    }>;
    svCumAreas?: number[];
    combinedSegments?: Array<{
      start: number;
      end: number;
      sv: number;
      bpm?: number;
      multiplier?: number;
    }>;
    combinedCumAreas?: number[];
    measures?: number[];
    maxCombo?: number;
    totalObjects?: number;
    duration?: number;
    drainTime?: number;
  };
  custom?: {
    "4keySpecific"?: {
      scrollSpeed?: number;
      judgementWindows?: {
        perfect: number;
        great: number;
        good: number;
        bad: number;
        miss: number;
      };
      keyBindings?: string[];
      skin?: string;
      particleEffects?: boolean;
    };
    creatorInfo?: {
      createdAt?: string;
      updatedAt?: string;
      toolsUsed?: string[];
      tags?: string[];
    };
  };
}

export class JSONBeatmapParser extends BaseBeatmapParser {
  parse(content: string): Beatmap {
    let jsonData: JSONBeatmapFormat;
    try {
      jsonData = JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON format: ${error}`);
    }

    // 验证必需字段
    if (!jsonData.objects || !jsonData.objects.hitObjects) {
      throw new Error("Missing required fields: objects.hitObjects");
    }

    // 创建基础Beatmap结构
    const beatmap: Beatmap = {
      metadata: this.convertMetadata(jsonData.metadata || {}),
      general: this.convertGeneral(jsonData.general || {}),
      difficulty: this.convertDifficulty(jsonData.difficulty || {}),
      timingPoints: this.convertTimingPoints(jsonData.timing),
      hitObjects: this.convertHitObjects(jsonData.objects.hitObjects),
      keyCount: jsonData.objects.keyCount || 4,
      svSegments: [],
      svCumAreas: [],
      combinedSegments: [],
      combinedCumAreas: [],
    };

    // 如果有预计算的SV分段，直接使用
    if (jsonData.calculated?.svSegments && jsonData.calculated.svCumAreas) {
      beatmap.svSegments = jsonData.calculated.svSegments;
      beatmap.svCumAreas = jsonData.calculated.svCumAreas;
    } else {
      // 保存原始时间点供SV计算
      beatmap.rawTimingPointsForSV = [...beatmap.timingPoints];

      // 对齐时间点（用于小节线显示）
      this.alignTimingPoints(beatmap.timingPoints);

      // 构建SV分段
      this.buildSVSegments(beatmap);
    }

    // 如果有预计算的混合分段，直接使用
    if (
      jsonData.calculated?.combinedSegments &&
      jsonData.calculated.combinedCumAreas
    ) {
      beatmap.combinedSegments = jsonData.calculated.combinedSegments;
      beatmap.combinedCumAreas = jsonData.calculated.combinedCumAreas;
    } else {
      this.buildCombinedSegments(beatmap);
    }

    // 如果有预计算的小节线，直接使用
    if (jsonData.calculated?.measures) {
      beatmap.measures = jsonData.calculated.measures;
    } else {
      this.calculateMeasures(beatmap);
    }

    // 键数转换（如果不是4键）
    if (beatmap.keyCount !== 4) {
      beatmap.hitObjects = this.convertTo4Key(
        beatmap.hitObjects,
        beatmap.keyCount,
      );
      beatmap.keyCount = 4;
    } else {
      // 确保列号正确
      for (const obj of beatmap.hitObjects) {
        if (obj.column === undefined) {
          obj.column = Math.floor((obj.x * 4) / 512);
        }
      }
    }

    // 键组计算（如果JSON中没有提供）
    const hasKeyGroups =
      jsonData.objects.keyGroups && jsonData.objects.keyGroups.length > 0;
    if (!hasKeyGroups) {
      // 如果有小节信息，按1/8小节分组（每1/8个小节换一个颜色组）
      if (beatmap.measures && beatmap.measures.length > 0) {
        this.calculateKeyGroupsBySubMeasures(
          beatmap.hitObjects,
          beatmap.measures,
          16, // 每小节分成16个子小节
        );
      } else {
        this.calculateKeyGroups(beatmap.hitObjects);
      }
    } else {
      // 使用JSON中的键组信息
      this.applyKeyGroupsFromJSON(
        beatmap.hitObjects,
        jsonData.objects.keyGroups,
      );
    }

    this.beatmap = beatmap;
    return beatmap;
  }

  private convertMetadata(
    jsonMetadata: JSONBeatmapFormat["metadata"],
  ): Record<string, string> {
    const metadata: Record<string, string> = {};

    if (jsonMetadata.title) metadata.Title = jsonMetadata.title;
    if (jsonMetadata.titleUnicode)
      metadata.TitleUnicode = jsonMetadata.titleUnicode;
    if (jsonMetadata.artist) metadata.Artist = jsonMetadata.artist;
    if (jsonMetadata.artistUnicode)
      metadata.ArtistUnicode = jsonMetadata.artistUnicode;
    if (jsonMetadata.creator) metadata.Creator = jsonMetadata.creator;
    if (jsonMetadata.version) metadata.Version = jsonMetadata.version;
    if (jsonMetadata.source) metadata.Source = jsonMetadata.source;
    if (jsonMetadata.tags) metadata.Tags = jsonMetadata.tags.join(" ");
    if (jsonMetadata.beatmapId)
      metadata.BeatmapID = jsonMetadata.beatmapId.toString();
    if (jsonMetadata.beatmapSetId)
      metadata.BeatmapSetID = jsonMetadata.beatmapSetId.toString();

    return metadata;
  }

  private convertGeneral(
    jsonGeneral: JSONBeatmapFormat["general"] | undefined,
  ): Record<string, string> {
    const general: Record<string, string> = {};

    if (!jsonGeneral) return general;

    if (jsonGeneral.audioFilename)
      general.AudioFilename = jsonGeneral.audioFilename;
    if (jsonGeneral.audioLeadIn !== undefined)
      general.AudioLeadIn = jsonGeneral.audioLeadIn.toString();
    if (jsonGeneral.previewTime !== undefined)
      general.PreviewTime = jsonGeneral.previewTime.toString();
    if (jsonGeneral.countdown !== undefined)
      general.Countdown = jsonGeneral.countdown.toString();
    if (jsonGeneral.sampleSet) general.SampleSet = jsonGeneral.sampleSet;
    if (jsonGeneral.stackLeniency !== undefined)
      general.StackLeniency = jsonGeneral.stackLeniency.toString();
    if (jsonGeneral.mode !== undefined)
      general.Mode = jsonGeneral.mode.toString();
    if (jsonGeneral.letterboxInBreaks !== undefined)
      general.LetterboxInBreaks = jsonGeneral.letterboxInBreaks ? "1" : "0";
    if (jsonGeneral.useSkinSprites !== undefined)
      general.UseSkinSprites = jsonGeneral.useSkinSprites ? "1" : "0";
    if (jsonGeneral.overlayPosition)
      general.OverlayPosition = jsonGeneral.overlayPosition;

    return general;
  }

  private convertDifficulty(
    jsonDifficulty: JSONBeatmapFormat["difficulty"],
  ): Record<string, number | string> {
    const difficulty: Record<string, number | string> = {};

    if (jsonDifficulty.hpDrainRate !== undefined)
      difficulty.HPDrainRate = jsonDifficulty.hpDrainRate;
    if (jsonDifficulty.circleSize !== undefined)
      difficulty.CircleSize = jsonDifficulty.circleSize;
    if (jsonDifficulty.overallDifficulty !== undefined)
      difficulty.OverallDifficulty = jsonDifficulty.overallDifficulty;
    if (jsonDifficulty.approachRate !== undefined)
      difficulty.ApproachRate = jsonDifficulty.approachRate;
    if (jsonDifficulty.sliderMultiplier !== undefined)
      difficulty.SliderMultiplier = jsonDifficulty.sliderMultiplier;
    if (jsonDifficulty.sliderTickRate !== undefined)
      difficulty.SliderTickRate = jsonDifficulty.sliderTickRate;

    return difficulty;
  }

  private convertTimingPoints(
    jsonPoints: JSONBeatmapFormat["timing"] | undefined,
  ): TimingPoint[] {
    if (!jsonPoints || !jsonPoints.points) return [];
    return jsonPoints.points.map((point) => ({
      time: point.time,
      beatLength: point.beatLength,
      meter: point.meter || 4,
      uninherited: point.uninherited,
    }));
  }

  private convertHitObjects(
    jsonObjects: JSONBeatmapFormat["objects"]["hitObjects"],
  ): HitObject[] {
    return jsonObjects.map((obj) => {
      const hitObject: HitObject = {
        x: obj.x || 0,
        time: obj.type === "longNote" ? obj.startTime || obj.time : obj.time,
        type: this.getObjectType(obj.type),
        isLongNote: obj.type === "longNote",
        endTime: obj.type === "longNote" ? obj.endTime || obj.time : obj.time,
        column: obj.column || 0,
        keyGroup: obj.extras?.keyGroup || 0,
      };

      // 如果是长按音符，确保endTime正确
      if (obj.type === "longNote" && !obj.endTime) {
        console.warn("Long note missing endTime, using time + 100ms");
        hitObject.endTime = hitObject.time + 100;
      }

      return hitObject;
    });
  }

  private getObjectType(type: string): number {
    switch (type) {
      case "circle":
        return 1;
      case "longNote":
        return 128; // LN类型
      case "slider":
        return 2;
      default:
        return 1; // 默认圆形
    }
  }

  private applyKeyGroupsFromJSON(
    hitObjects: HitObject[],
    keyGroups: JSONBeatmapFormat["objects"]["keyGroups"],
  ): void {
    if (!keyGroups) return;

    // 创建对象ID到对象的映射
    const objectMap = new Map<string, HitObject>();
    hitObjects.forEach((obj, index) => {
      objectMap.set(`obj_${index}`, obj);
    });

    // 应用键组
    for (const group of keyGroups) {
      if (group.objects) {
        for (const objId of group.objects) {
          const obj = objectMap.get(objId);
          if (obj) {
            obj.keyGroup = group.id;
          }
        }
      }
    }

    // 为没有分配键组的对象分配默认键组
    let currentGroup = Math.max(...keyGroups.map((g) => g.id)) + 1;
    for (const obj of hitObjects) {
      if (obj.keyGroup === 0) {
        obj.keyGroup = currentGroup++;
      }
    }
  }
}
