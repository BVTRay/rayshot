import { LanguageMode } from './types';

// --- Helper Types ---
export interface OptionItem {
  value: string; // Canonical English
  labelZh: string;
}

// --- Data Mappings ---

export const SHOT_SIZES: OptionItem[] = [
  { value: 'ECU', labelZh: '大特写' },
  { value: 'CU', labelZh: '特写' },
  { value: 'MCU', labelZh: '中近景' },
  { value: 'MS', labelZh: '中景' },
  { value: 'Cowboy', labelZh: '七分身' },
  { value: 'FS', labelZh: '全景' },
  { value: 'WS', labelZh: '远景' },
  { value: 'EWS', labelZh: '大远景' }
];

export const PERSPECTIVES: OptionItem[] = [
  { value: 'Eye-level', labelZh: '平视' },
  { value: 'Low Angle', labelZh: '仰拍' },
  { value: 'High Angle', labelZh: '俯拍' },
  { value: 'Top-down', labelZh: '顶视' },
  { value: "Bird's Eye", labelZh: '上帝视角' },
  { value: "Worm's Eye", labelZh: '虫视' },
  { value: 'OTS', labelZh: '过肩' },
  { value: 'POV', labelZh: '主观' }
];

export const MOVEMENTS: OptionItem[] = [
  { value: 'Static', labelZh: '固定' },
  { value: 'Pan Left', labelZh: '左摇' },
  { value: 'Pan Right', labelZh: '右摇' },
  { value: 'Tilt Up', labelZh: '上仰' },
  { value: 'Tilt Down', labelZh: '下俯' },
  { value: 'Dolly In', labelZh: '前推' },
  { value: 'Dolly Out', labelZh: '后拉' },
  { value: 'Truck', labelZh: '横移' },
  { value: 'Pedestal', labelZh: '升降' },
  { value: 'Zoom In', labelZh: '推焦' },
  { value: 'Zoom Out', labelZh: '拉焦' },
  { value: 'Handheld', labelZh: '手持' },
  { value: 'Whip Pan', labelZh: '甩镜头' }
];

export const FOCAL_LENGTHS: OptionItem[] = [
  { value: '16mm (Wide)', labelZh: '16mm 大广角' },
  { value: '24mm (Wide)', labelZh: '24mm 广角' },
  { value: '35mm (Standard Wide)', labelZh: '35mm 人文' },
  { value: '50mm (Standard)', labelZh: '50mm 标准' },
  { value: '85mm (Portrait)', labelZh: '85mm 特写' },
  { value: '100mm (Telephoto)', labelZh: '100mm 长焦' },
  { value: 'Macro', labelZh: '微距' }
];

// Added some basic translations for Equipment to keep UI consistent
export const EQUIPMENT: OptionItem[] = [
  { value: 'Tripod', labelZh: '三脚架' },
  { value: 'Handheld', labelZh: '手持' },
  { value: 'Gimbal', labelZh: '稳定器' },
  { value: 'Steadicam', labelZh: '斯坦尼康' },
  { value: 'Dolly', labelZh: '移动车' },
  { value: 'Jib/Crane', labelZh: '摇臂' },
  { value: 'Drone', labelZh: '无人机' },
  { value: 'Slider', labelZh: '滑轨' }
];

export const TIMES = ['DAY', 'NIGHT', 'DAWN', 'DUSK'];
export const INT_EXT_OPTIONS = ['INT.', 'EXT.', 'INT./EXT.'];
export const DEFAULT_ASPECT_RATIO = "9:16";

// --- UI Dictionary ---
export const UI_LABELS = {
  en: {
    episodes: 'Episodes',
    scenes: 'Scenes',
    addScene: 'Add New Scene',
    addEpisode: 'New Ep',
    addShot: 'Add Shot',
    export: 'Export',
    exportEp: 'Export Current Episode',
    exportAll: 'Export All Episodes',
    sceneHeading: 'Scene Heading',
    locationPlaceholder: 'LOCATION NAME',
    noShots: 'No shots in this scene yet.',
    createFirstShot: '+ Create first shot',
    totalShots: 'Total Shots',
    scene: 'Scene',
    shot: 'Shot',
    desc: 'Description',
    ert: 'ERT',
    size: 'Size',
    angle: 'Angle',
    move: 'Move',
    gear: 'Gear',
    lens: 'Lens',
    aspect: 'Aspect',
    notes: 'Notes',
    deleteEp: 'Delete Episode',
    visual: 'Visual',
    generateSketch: 'Generate AI Sketch',
    settings: 'Settings',
    apiKey: 'API Key',
    apiKeyPlaceholder: 'Enter your API Key',
    saveSettings: 'Save Settings',
    closeSettings: 'Close',
    generating: 'Generating...',
    error: 'Error',
    zoom: 'Zoom',
    regenerate: 'Regenerate'
  },
  zh: {
    episodes: '集数列表',
    scenes: '场景列表',
    addScene: '添加新场景',
    addEpisode: '新分集',
    addShot: '添加镜头',
    export: '导出',
    exportEp: '导出当前分集',
    exportAll: '导出全部分集',
    sceneHeading: '场景标题',
    locationPlaceholder: '场景名称',
    noShots: '该场景暂无镜头',
    createFirstShot: '+ 创建第一个镜头',
    totalShots: '镜头总数',
    scene: '场号',
    shot: '镜号',
    desc: '画面描述',
    ert: '时长',
    size: '景别',
    angle: '视角',
    move: '运镜',
    gear: '设备',
    lens: '焦段',
    aspect: '画幅',
    notes: '备注',
    deleteEp: '删除分集',
    visual: '视觉',
    generateSketch: '生成AI草图',
    settings: '设置',
    apiKey: 'API密钥',
    apiKeyPlaceholder: '输入您的API密钥',
    saveSettings: '保存设置',
    closeSettings: '关闭',
    generating: '生成中...',
    error: '错误',
    zoom: '放大',
    regenerate: '重新生成'
  }
};

// --- Helpers ---
export const getLabel = (option: OptionItem, mode: LanguageMode): string => {
  if (mode === 'en') return option.value;
  if (mode === 'zh') return option.labelZh;
  return `${option.value} (${option.labelZh})`;
};

export const getUIText = (key: keyof typeof UI_LABELS.en, mode: LanguageMode) => {
  const lang = mode === 'en' ? 'en' : 'zh'; // Fallback to zh for 'bi' mode in UI labels usually, or strict check
  // For 'bi' mode in main UI, we generally prefer English or a mix. Let's stick to English for 'bi' on general labels to avoid clutter, 
  // or use Chinese if RayShot is China-first. Given "RayShot (锐哨分镜)", let's default 'bi' to English for UI chrome to keep it clean, 
  // but dropdowns are bilingual.
  // Actually, user might want Chinese UI in Bilingual mode. Let's map 'bi' -> 'zh' for UI chrome labels for better accessibility in China.
  const targetLang = mode === 'en' ? 'en' : 'zh';
  return UI_LABELS[targetLang][key];
};
