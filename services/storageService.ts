import { Episode } from '../types';

const STORAGE_KEY = 'rayshot_project_data_v1';

export interface ProjectFile {
  version: string;
  timestamp: number;
  episodes: Episode[];
}

// --- Local Storage ---

export const saveToLocalStorage = (episodes: Episode[]) => {
  try {
    const data: ProjectFile = {
      version: '1.0',
      timestamp: Date.now(),
      episodes,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error("Failed to save to local storage", e);
    return false;
  }
};

export const loadFromLocalStorage = (): Episode[] | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: ProjectFile = JSON.parse(raw);
    return data.episodes || null;
  } catch (e) {
    console.error("Failed to load from local storage", e);
    return null;
  }
};

// --- File I/O ---

export const exportProjectFile = (episodes: Episode[], projectTitle: string) => {
  const data: ProjectFile = {
    version: '1.0',
    timestamp: Date.now(),
    episodes,
  };

  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const dateStr = new Date().toISOString().split('T')[0];
  // Sanitize title
  const safeTitle = projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `rayshot_${safeTitle}_${dateStr}.ray`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const parseProjectFile = async (file: File): Promise<Episode[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const result = e.target?.result as string;
        const data: ProjectFile = JSON.parse(result);
        
        // Basic Validation
        if (!data.episodes || !Array.isArray(data.episodes)) {
          throw new Error("Invalid file structure: Missing episodes array.");
        }
        
        resolve(data.episodes);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};
