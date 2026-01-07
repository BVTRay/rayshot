import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Plus, 
  Download, 
  LayoutList,
  Trash2,
  MonitorPlay,
  ChevronDown,
  Save,
  FolderOpen,
  CheckCircle2,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { Scene, Shot, SceneField, ShotField, Episode, LanguageMode } from './types';
import { INT_EXT_OPTIONS, TIMES, DEFAULT_ASPECT_RATIO, UI_LABELS, getUIText } from './constants';
import { ShotRow } from './components/ShotRow';
import { RayShotLogo } from './components/RayShotLogo';
import { exportToExcel } from './services/excelService';
import { 
  saveToLocalStorage, 
  loadFromLocalStorage, 
  exportProjectFile, 
  parseProjectFile 
} from './services/storageService';
import { getApiKey, saveApiKey } from './services/geminiService';

const App: React.FC = () => {
  // --- State ---
  const [langMode, setLangMode] = useState<LanguageMode>('en');
  const [lastAddedShotId, setLastAddedShotId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false); // To prevent auto-save overwriting empty state on load
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  
  const [episodes, setEpisodes] = useState<Episode[]>([
    {
      id: 'ep-1',
      title: 'Episode 1',
      episodeNumber: 1,
      scenes: [
        {
          id: 'scene-1',
          sceneNumber: 1,
          intExt: 'INT.',
          location: '',
          time: 'DAY',
          shots: []
        }
      ]
    }
  ]);
  
  const [activeEpisodeId, setActiveEpisodeId] = useState<string>('ep-1');
  const [activeSceneId, setActiveSceneId] = useState<string>('scene-1');
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isSketchExpanded, setIsSketchExpanded] = useState<boolean>(true);
  const [isComposing, setIsComposing] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Derived State ---
  const activeEpisode = episodes.find(e => e.id === activeEpisodeId) || episodes[0];
  const activeScene = activeEpisode.scenes.find(s => s.id === activeSceneId) || activeEpisode.scenes[0];

  // --- Sensors for DnD ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, 
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- Storage Effects ---

  // 1. Load on Mount
  useEffect(() => {
    const savedEpisodes = loadFromLocalStorage();
    if (savedEpisodes && savedEpisodes.length > 0) {
      setEpisodes(savedEpisodes);
      // Ensure active IDs are valid
      setActiveEpisodeId(savedEpisodes[0].id);
      if(savedEpisodes[0].scenes.length > 0) {
        setActiveSceneId(savedEpisodes[0].scenes[0].id);
      }
      console.log('Loaded from local storage');
    }
    setIsLoaded(true);
    
    // Load API Key (with default)
    const savedApiKey = getApiKey();
    if (savedApiKey) {
      setApiKeyInput(savedApiKey);
    } else {
      // Set default API Key for Doubao
      const defaultApiKey = '0d8b9599-f7ab-418d-96fc-dfc31f6e669a';
      saveApiKey(defaultApiKey);
      setApiKeyInput(defaultApiKey);
    }
  }, []);

  // 2. Auto-Save on Change
  useEffect(() => {
    if (!isLoaded) return; // Don't save before initial load is complete

    const success = saveToLocalStorage(episodes);
    if (success) {
      const now = new Date();
      setLastSavedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, [episodes, isLoaded]);

  // Ensure activeSceneId is valid when switching episodes
  useEffect(() => {
    const sceneExists = activeEpisode.scenes.find(s => s.id === activeSceneId);
    if (!sceneExists && activeEpisode.scenes.length > 0) {
      setActiveSceneId(activeEpisode.scenes[0].id);
    }
  }, [activeEpisodeId, activeEpisode.scenes, activeSceneId]);

  // --- Helpers ---
  const generateId = () => Math.random().toString(36).substr(2, 9);
  const t = (key: keyof typeof UI_LABELS.en) => getUIText(key, langMode);

  // Re-indexes shots 1..N based on array order
  const reindexShots = (shots: Shot[]): Shot[] => {
    return shots.map((shot, index) => ({
      ...shot,
      shotNumber: index + 1
    }));
  };

  // --- Handlers: File I/O ---
  const handleSaveProject = () => {
    exportProjectFile(episodes, activeEpisode.title);
  };

  const handleOpenProjectClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedEpisodes = await parseProjectFile(file);
      setEpisodes(importedEpisodes);
      // Reset active views
      if (importedEpisodes.length > 0) {
        setActiveEpisodeId(importedEpisodes[0].id);
        if (importedEpisodes[0].scenes.length > 0) {
          setActiveSceneId(importedEpisodes[0].scenes[0].id);
        }
      }
      // Reset input so same file can be loaded again if needed
      event.target.value = '';
      alert('Project loaded successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to load project file. Please ensure it is a valid .ray or .json file.');
    }
  };

  // --- Handlers: Episode ---
  const addEpisode = () => {
    const nextEpNum = episodes.length + 1;
    const newEp: Episode = {
      id: generateId(),
      title: `Episode ${nextEpNum}`,
      episodeNumber: nextEpNum,
      scenes: [{
        id: generateId(),
        sceneNumber: 1,
        intExt: 'INT.',
        location: '',
        time: 'DAY',
        shots: []
      }]
    };
    setEpisodes([...episodes, newEp]);
    setActiveEpisodeId(newEp.id);
  };

  const updateEpisodeTitle = (id: string, newTitle: string) => {
    setEpisodes(prev => prev.map(ep => ep.id === id ? { ...ep, title: newTitle } : ep));
  };

  // --- Handlers: Scene ---
  const addScene = () => {
    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      
      const nextSceneNumber = ep.scenes.length > 0 
        ? Math.max(...ep.scenes.map(s => s.sceneNumber)) + 1 
        : 1;

      const newScene: Scene = {
        id: generateId(),
        sceneNumber: nextSceneNumber,
        intExt: 'INT.',
        location: '',
        time: 'DAY',
        shots: []
      };
      
      if (ep.scenes.length === 0) setTimeout(() => setActiveSceneId(newScene.id), 0);
      else setActiveSceneId(newScene.id); 

      return { ...ep, scenes: [...ep.scenes, newScene] };
    }));
  };

  const updateScene = (id: string, field: SceneField, value: any) => {
    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      return {
        ...ep,
        scenes: ep.scenes.map(scene => 
          scene.id === id ? { ...scene, [field]: value } : scene
        )
      };
    }));
  };

  const deleteScene = (id: string) => {
    if (activeEpisode.scenes.length <= 1) return;
    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      const newScenes = ep.scenes.filter(s => s.id !== id);
      return { ...ep, scenes: newScenes };
    }));
  };

  // --- Handlers: Shot Management ---

  const createShot = (inheritFrom: Shot | null): Shot => {
    return {
      id: generateId(),
      shotNumber: 0, 
      description: '', 
      ert: '', 
      notes: '', 
      size: inheritFrom?.size || '',
      perspective: inheritFrom?.perspective || '',
      movement: inheritFrom?.movement || '',
      equipment: inheritFrom?.equipment || '',
      focalLength: inheritFrom?.focalLength || '',
      aspectRatio: inheritFrom?.aspectRatio || DEFAULT_ASPECT_RATIO,
    };
  };

  const addShot = useCallback(() => {
    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      return {
        ...ep,
        scenes: ep.scenes.map(scene => {
          if (scene.id !== activeSceneId) return scene;
          
          const lastShot = scene.shots.length > 0 ? scene.shots[scene.shots.length - 1] : null;
          const newShot = createShot(lastShot);
          
          const newShots = reindexShots([...scene.shots, newShot]);
          
          setLastAddedShotId(newShot.id);
          return { ...scene, shots: newShots };
        })
      };
    }));
  }, [activeEpisodeId, activeSceneId]);

  const insertShot = useCallback((afterShotId: string) => {
    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      return {
        ...ep,
        scenes: ep.scenes.map(scene => {
          if (scene.id !== activeSceneId) return scene;

          const index = scene.shots.findIndex(s => s.id === afterShotId);
          if (index === -1) return scene;

          const currentShot = scene.shots[index];
          const newShot = createShot(currentShot); 

          const newShotsList = [...scene.shots];
          newShotsList.splice(index + 1, 0, newShot);
          
          const reindexed = reindexShots(newShotsList);
          
          setLastAddedShotId(newShot.id);
          return { ...scene, shots: reindexed };
        })
      };
    }));
  }, [activeEpisodeId, activeSceneId]);

  const updateShot = useCallback((shotId: string, field: ShotField, value: any) => {
    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      return {
        ...ep,
        scenes: ep.scenes.map(scene => {
          if (scene.id !== activeSceneId) return scene;
          return {
            ...scene,
            shots: scene.shots.map(shot => 
              shot.id === shotId ? { ...shot, [field]: value } : shot
            )
          };
        })
      };
    }));
  }, [activeEpisodeId, activeSceneId]);

  const deleteShot = (shotId: string) => {
    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      return {
        ...ep,
        scenes: ep.scenes.map(scene => {
          if (scene.id !== activeSceneId) return scene;
          const filteredShots = scene.shots.filter(s => s.id !== shotId);
          return { ...scene, shots: reindexShots(filteredShots) };
        })
      };
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      return {
        ...ep,
        scenes: ep.scenes.map(scene => {
          if (scene.id !== activeSceneId) return scene;

          const oldIndex = scene.shots.findIndex(s => s.id === active.id);
          const newIndex = scene.shots.findIndex(s => s.id === over.id);
          
          if (oldIndex === -1 || newIndex === -1) return scene;

          const reorderedShots = arrayMove(scene.shots, oldIndex, newIndex);
          return { ...scene, shots: reindexShots(reorderedShots) };
        })
      };
    }));
  };

  const handleExport = (scope: 'single' | 'all') => {
    exportToExcel(episodes, activeEpisodeId, scope, `RayShot_Export_${scope}.xlsx`);
    setIsExportMenuOpen(false);
  };

  const handleOpenSettings = () => {
    const savedApiKey = getApiKey();
    setApiKeyInput(savedApiKey || '');
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = () => {
    if (apiKeyInput.trim()) {
      saveApiKey(apiKeyInput.trim());
      setIsSettingsOpen(false);
    }
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        addShot();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [addShot]);

  // --- Styles ---
  const InputClass = "bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all";
  const LabelClass = "block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1";

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileImport}
        className="hidden"
        accept=".json,.ray"
      />

      {/* Sidebar */}
      <aside className="w-56 border-r border-zinc-800 flex flex-col bg-zinc-950 flex-shrink-0 z-20 shadow-xl">
        <div className="p-3 border-b border-zinc-800 flex items-center space-x-2 bg-zinc-950">
          <div className="w-7 h-7 bg-gradient-to-br from-cyan-600 to-teal-700 rounded-lg flex items-center justify-center text-white shadow-lg shadow-cyan-900/30">
            <RayShotLogo size={16} />
          </div>
          <h1 className="font-bold text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-100 to-zinc-400">RayShot</h1>
        </div>

        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('episodes')}</span>
            <button onClick={addEpisode} className="text-cyan-500 hover:text-cyan-400 p-1">
              <Plus size={12} />
            </button>
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto mb-2 scrollbar-thin">
            {episodes.map(ep => (
              <div 
                key={ep.id}
                onClick={() => setActiveEpisodeId(ep.id)}
                className={`
                  flex items-center space-x-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-all
                  ${activeEpisodeId === ep.id ? 'bg-zinc-800 text-cyan-400 border-l-2 border-cyan-500' : 'text-zinc-400 hover:bg-zinc-900'}
                `}
              >
                <MonitorPlay size={12} />
                <input 
                  className="bg-transparent border-none outline-none w-full cursor-pointer focus:cursor-text text-xs"
                  value={ep.title}
                  onChange={(e) => updateEpisodeTitle(ep.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-zinc-800 mx-3 mb-2"></div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 py-1 flex items-center justify-between">
             <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('scenes')}</span>
          </div>
          <div className="flex-1 overflow-y-auto px-1 space-y-0.5">
            {activeEpisode.scenes.map((scene) => (
              <div 
                key={scene.id}
                onClick={() => setActiveSceneId(scene.id)}
                className={`
                  group flex items-center justify-between px-2 py-2 rounded cursor-pointer transition-all border
                  ${activeSceneId === scene.id 
                    ? 'bg-zinc-900 border-zinc-700 text-white shadow-md' 
                    : 'border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}
                `}
              >
                <div className="flex items-center space-x-2 overflow-hidden">
                  <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${activeSceneId === scene.id ? 'bg-cyan-900 text-cyan-300' : 'bg-zinc-800 text-zinc-500'}`}>
                    {scene.sceneNumber}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-medium truncate">
                      {[scene.intExt, scene.location].filter(Boolean).join(' ') || 'Untitled'}
                    </span>
                  </div>
                </div>
                {activeEpisode.scenes.length > 1 && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteScene(scene.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-zinc-800">
          <button 
            onClick={addScene}
            className="w-full flex items-center justify-center space-x-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white py-1.5 rounded text-xs font-medium transition-colors border border-zinc-700"
          >
            <Plus size={14} />
            <span>{t('addScene')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-zinc-950">
        
        {/* Header */}
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950 flex-shrink-0 z-10">
          <div className="flex items-center space-x-4">
             <div className="flex flex-col">
               <span className="text-[10px] text-cyan-600 font-bold tracking-widest uppercase mb-0.5">{activeEpisode.title}</span>
               <div className="flex items-center space-x-2">
                 <h2 className="text-lg font-bold text-zinc-100">{t('scene')} {activeScene.sceneNumber}</h2>
                 <span className="text-zinc-700">/</span>
                 <span className="text-xs text-zinc-400">{t('totalShots')}: {activeScene.shots.length}</span>
               </div>
             </div>
          </div>
          
          <div className="flex items-center space-x-3">
             {/* Settings */}
             <button
              onClick={handleOpenSettings}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800"
              title={t('settings')}
             >
               <Settings size={14} />
               <span>{t('settings')}</span>
             </button>

             <div className="w-px h-6 bg-zinc-800 mx-1"></div>

             {/* Open Project */}
             <button
              onClick={handleOpenProjectClick}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800"
              title="Open Project File (.ray)"
             >
               <FolderOpen size={14} />
               <span>Open</span>
             </button>

             {/* Save Project */}
             <button
              onClick={handleSaveProject}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800"
              title="Save Project File (.ray)"
             >
               <Save size={14} />
               <span>Save</span>
             </button>

             <div className="w-px h-6 bg-zinc-800 mx-1"></div>

            <div className="flex items-center bg-zinc-900 rounded-md p-0.5 border border-zinc-800">
               {['en', 'zh', 'bi'].map((mode) => (
                 <button 
                  key={mode}
                  onClick={() => setLangMode(mode as LanguageMode)} 
                  className={`px-2 py-1 text-[10px] font-medium rounded-sm uppercase ${langMode === mode ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                 >
                   {mode}
                 </button>
               ))}
            </div>

            {/* Sketch View Toggle */}
            <button
              onClick={() => setIsSketchExpanded(!isSketchExpanded)}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800"
              title={isSketchExpanded ? 'Collapse Sketch' : 'Expand Sketch'}
            >
              {isSketchExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{isSketchExpanded ? 'Collapse' : 'Expand'}</span>
            </button>

            <div className="relative">
              <button 
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="flex items-center space-x-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-700"
              >
                <Download size={14} />
                <span>{t('export')}</span>
                <ChevronDown size={12} />
              </button>
              
              {isExportMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded shadow-xl py-1 z-50">
                  <button 
                    onClick={() => handleExport('single')}
                    className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    {t('exportEp')}
                  </button>
                  <button 
                    onClick={() => handleExport('all')}
                    className="w-full text-left px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
                  >
                    {t('exportAll')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scene Config (Compact) */}
        <div className="bg-zinc-950 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
           <div className="max-w-5xl">
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-2">
                  <label className={LabelClass}>Header</label>
                  <select 
                    value={activeScene.intExt}
                    onChange={(e) => updateScene(activeScene.id, 'intExt', e.target.value)}
                    className={`${InputClass} w-full appearance-none`}
                  >
                    {INT_EXT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="col-span-8">
                  <label className={LabelClass}>{t('sceneHeading')}</label>
                  <input 
                    type="text" 
                    value={activeScene.location}
                    onChange={(e) => {
                      const value = isComposing ? e.target.value : e.target.value.toUpperCase();
                      updateScene(activeScene.id, 'location', value);
                    }}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={(e) => {
                      setIsComposing(false);
                      updateScene(activeScene.id, 'location', e.currentTarget.value.toUpperCase());
                    }}
                    placeholder={t('locationPlaceholder')}
                    className={`${InputClass} w-full uppercase font-medium tracking-wide`}
                  />
                </div>
                <div className="col-span-2">
                  <label className={LabelClass}>Time</label>
                  <select 
                    value={activeScene.time}
                    onChange={(e) => updateScene(activeScene.id, 'time', e.target.value)}
                    className={`${InputClass} w-full appearance-none`}
                  >
                    {TIMES.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              </div>
           </div>
        </div>

        {/* Shot Table (Compact) with DnD */}
        <div className="flex-1 overflow-auto bg-zinc-950 relative">
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            onDragStart={() => {
              // Optional: Add any drag start logic here
            }}
          >
            <table className="w-full text-left border-collapse table-fixed">
              <thead className="bg-zinc-900/95 backdrop-blur sticky top-0 z-10 border-b border-zinc-800">
                <tr>
                  <th className="p-1 w-8"></th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 text-center w-8">#</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-64">{t('desc')}</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-16 text-center">{t('ert')}</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-28">{t('size')}</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-28">{t('angle')}</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-28">{t('move')}</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-24">{t('gear')}</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-32">{t('lens')}</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-16 text-center">{t('aspect')}</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-40">{t('notes')}</th>
                  <th className={`p-1 text-[10px] font-bold text-zinc-500 w-32 text-center ${!isSketchExpanded ? 'hidden' : ''}`}>{t('visual')}</th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-16 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                <SortableContext 
                  items={activeScene.shots.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {activeScene.shots.map((shot) => (
                    <ShotRow 
                      key={shot.id}
                      shot={shot} 
                      onChange={updateShot} 
                      onDelete={deleteShot}
                      onInsert={insertShot}
                      langMode={langMode}
                      shouldAutoFocus={shot.id === lastAddedShotId}
                      sceneLocation={activeScene.location}
                      sceneTime={activeScene.time}
                      isSketchExpanded={isSketchExpanded}
                    />
                  ))}
                </SortableContext>
              </tbody>
            </table>
          </DndContext>
          
          {/* Add Shot at Bottom */}
          <div className="px-4 pb-8 pt-2">
            <button 
              onClick={addShot}
              className="w-full border-2 border-dashed border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 hover:bg-zinc-900/50 py-3 rounded flex items-center justify-center transition-all group"
            >
              <Plus size={16} className="mr-2 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium font-mono tracking-wide">+ ADD NEXT SHOT</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950 flex justify-between items-center flex-shrink-0">
          <div className="text-[10px] text-zinc-600 flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <span className="font-mono bg-zinc-900 px-1 rounded border border-zinc-800 text-zinc-500">CMD+ENTER</span>
              <span>Add Shot</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="font-mono bg-zinc-900 px-1 rounded border border-zinc-800 text-zinc-500">TAB</span>
              <span>Next Field</span>
            </div>
            {/* Auto Save Indicator */}
            {lastSavedTime && (
              <div className="flex items-center space-x-1.5 text-emerald-600/80 animate-pulse ml-4">
                <CheckCircle2 size={10} />
                <span>Saved {lastSavedTime}</span>
              </div>
            )}
          </div>
          <button 
            onClick={addShot}
            className="flex items-center space-x-2 bg-gradient-to-r from-cyan-700 to-teal-700 hover:from-cyan-600 hover:to-teal-600 text-white px-4 py-1.5 rounded text-xs font-medium shadow-lg shadow-cyan-900/20 transition-all"
          >
            <Plus size={14} />
            <span className="font-medium">{t('addShot')}</span>
          </button>
        </div>

      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-100">{t('settings')}</h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <ChevronDown size={20} className="rotate-180" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={LabelClass}>{t('apiKey')}</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={t('apiKeyPlaceholder')}
                  className={`${InputClass} w-full`}
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Your API key is stored locally and never shared.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {t('closeSettings')}
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="px-4 py-2 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors"
                >
                  {t('saveSettings')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
