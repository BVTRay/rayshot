export type LanguageMode = 'en' | 'zh' | 'bi';

export interface ProjectKeyword {
  name: string;
  category: 'Character' | 'Location' | 'Item';
  visual_traits?: string;
}

export interface Shot {
  id: string;
  shotNumber: number;
  description: string;
  ert: string;
  duration: number;     // Duration in seconds
  size: string;         // Canonical (English)
  perspective: string;  // Canonical (English)
  movement: string;     // Canonical (English)
  equipment: string;    // Canonical (English)
  focalLength: string;  // Canonical (English)
  aspectRatio: string;
  notes: string;
  sketchImage?: string; // Base64 data URL for the generated sketch
}

export interface Scene {
  id: string;
  sceneNumber: number;
  intExt: 'INT.' | 'EXT.' | 'INT./EXT.';
  location: string;
  time: 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK';
  outline?: string; // 场景大纲，用于AI参考
  elements?: ProjectKeyword[]; // 场景关键要素，用于AI参考（与项目配置中的要素管理保持一致）
  shots: Shot[];
}

export interface Episode {
  id: string;
  title: string;
  episodeNumber: number;
  scenes: Scene[];
}

export type SceneField = 'intExt' | 'location' | 'time' | 'outline' | 'elements';
export type ShotField = keyof Shot;

// 字段默认值类型
export type DefaultValueType = 'empty' | 'inherit' | 'custom';

// 字段配置
export interface FieldConfig {
  visible: boolean; // 是否显示
  defaultValueType: DefaultValueType; // 默认值类型
  customValue?: string; // 自定义值（当defaultValueType为'custom'时使用）
  allowAI: boolean; // 是否允许AI补全
}

// 所有字段的配置
export interface FieldSettings {
  description: FieldConfig;
  ert: FieldConfig;
  size: FieldConfig;
  perspective: FieldConfig;
  movement: FieldConfig;
  equipment: FieldConfig;
  focalLength: FieldConfig;
  aspectRatio: FieldConfig;
  notes: FieldConfig;
}
