export type LanguageMode = 'en' | 'zh' | 'bi';

export interface Shot {
  id: string;
  shotNumber: number;
  description: string;
  ert: string;
  size: string;         // Canonical (English)
  perspective: string;  // Canonical (English)
  movement: string;     // Canonical (English)
  equipment: string;    // Canonical (English)
  focalLength: string;  // Canonical (English)
  aspectRatio: string;
  notes: string;
}

export interface Scene {
  id: string;
  sceneNumber: number;
  intExt: 'INT.' | 'EXT.' | 'INT./EXT.';
  location: string;
  time: 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK';
  shots: Shot[];
}

export interface Episode {
  id: string;
  title: string;
  episodeNumber: number;
  scenes: Scene[];
}

export type SceneField = 'intExt' | 'location' | 'time';
export type ShotField = keyof Shot;
