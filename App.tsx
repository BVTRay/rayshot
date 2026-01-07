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
  EyeOff,
  Loader2,
  Sparkles,
  Edit2,
  X
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
import { INT_EXT_OPTIONS, TIMES, DEFAULT_ASPECT_RATIO, UI_LABELS, getUIText, getIntExtLabel, getTimeLabel } from './constants';
import { ShotRow } from './components/ShotRow';
import { RayShotLogo } from './components/RayShotLogo';
import { exportToExcel } from './services/excelService';
import { 
  saveToLocalStorage, 
  loadFromLocalStorage, 
  exportProjectFile, 
  parseProjectFile,
  saveKeywords,
  loadKeywords
} from './services/storageService';
import { getApiKey, saveApiKey, getGeminiApiKey, saveGeminiApiKey, analyzeScriptContext } from './services/geminiService';
import { ProjectKeyword } from './types';

const App: React.FC = () => {
  // --- State ---
  const [projectTitle, setProjectTitle] = useState<string>('未命名项目');
  const [langMode, setLangMode] = useState<LanguageMode>('zh');
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
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [projectSettingsTab, setProjectSettingsTab] = useState<'script' | 'keywords'>('script');
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState<string>('');
  const [isSketchExpanded, setIsSketchExpanded] = useState<boolean>(false);
  const [isComposing, setIsComposing] = useState<boolean>(false);
  const [isAutocompleteEnabled, setIsAutocompleteEnabled] = useState<boolean>(true); // AI自动补全功能开关
  const [keywords, setKeywords] = useState<ProjectKeyword[]>([]);
  const [editingKeywordIndex, setEditingKeywordIndex] = useState<number | null>(null);
  const [editingKeyword, setEditingKeyword] = useState<ProjectKeyword | null>(null);
  const [scriptText, setScriptText] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Derived State ---
  const activeEpisode = episodes.find(e => e.id === activeEpisodeId) || episodes[0];
  const activeScene = activeEpisode.scenes.find(s => s.id === activeSceneId) || activeEpisode.scenes[0];
  
  // Calculate scene total duration (in seconds) from ERT field
  const sceneTotalDuration = activeScene.shots.reduce((sum, shot) => {
    const ertValue = parseFloat(shot.ert) || 0;
    return sum + ertValue;
  }, 0);
  
  // Calculate episode total duration (in minutes) from ERT field
  const episodeTotalDuration = activeEpisode.scenes.reduce((epSum, scene) => {
    const sceneSum = scene.shots.reduce((shotSum, shot) => {
      const ertValue = parseFloat(shot.ert) || 0;
      return shotSum + ertValue;
    }, 0);
    return epSum + sceneSum;
  }, 0);
  const episodeTotalMinutes = (episodeTotalDuration / 60).toFixed(1);

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
    const savedData = loadFromLocalStorage();
    if (savedData && savedData.episodes && savedData.episodes.length > 0) {
      setEpisodes(savedData.episodes);
      if (savedData.projectTitle) {
        setProjectTitle(savedData.projectTitle);
      }
      // Ensure active IDs are valid
      setActiveEpisodeId(savedData.episodes[0].id);
      if(savedData.episodes[0].scenes.length > 0) {
        setActiveSceneId(savedData.episodes[0].scenes[0].id);
      }
      console.log('Loaded from local storage');
    } else {
      // Initialize default scene with 12 empty shots if no saved data
      // Create default shots inline since createShot is defined later
      const createDefaultShot = (index: number): Shot => ({
        id: generateId(),
        shotNumber: index + 1,
        description: '',
        ert: '',
        duration: 0,
        notes: '',
        size: '',
        perspective: '',
        movement: '',
        equipment: '',
        focalLength: '',
        aspectRatio: DEFAULT_ASPECT_RATIO,
      });
      
      setEpisodes(prev => prev.map(ep => ({
        ...ep,
        scenes: ep.scenes.map(scene => {
          if (scene.shots.length === 0) {
            const defaultShots: Shot[] = Array.from({ length: 12 }, (_, index) => createDefaultShot(index));
            return { ...scene, shots: defaultShots };
          }
          return scene;
        })
      })));
    }
    setIsLoaded(true);
    
    // Load Doubao API Key (with default)
    const savedApiKey = getApiKey();
    if (savedApiKey) {
      setApiKeyInput(savedApiKey);
    } else {
      // Set default API Key for Doubao
      const defaultApiKey = '0d8b9599-f7ab-418d-96fc-dfc31f6e669a';
      saveApiKey(defaultApiKey);
      setApiKeyInput(defaultApiKey);
    }
    
    // Load Gemini API Key
    const savedGeminiApiKey = getGeminiApiKey();
    if (savedGeminiApiKey) {
      setGeminiApiKeyInput(savedGeminiApiKey);
    }
    
    // Load keywords
    const savedKeywords = loadKeywords();
    if (savedKeywords && savedKeywords.length > 0) {
      setKeywords(savedKeywords);
    }
  }, []);

  // 2. Auto-Save on Change
  useEffect(() => {
    if (!isLoaded) return; // Don't save before initial load is complete

    const success = saveToLocalStorage(episodes, projectTitle);
    if (success) {
      const now = new Date();
      setLastSavedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, [episodes, projectTitle, isLoaded]);

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
    exportProjectFile(episodes, projectTitle);
  };

  const handleOpenProjectClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedData = await parseProjectFile(file);
      setEpisodes(importedData.episodes);
      if (importedData.projectTitle) {
        setProjectTitle(importedData.projectTitle);
      }
      // Reset active views
      if (importedData.episodes.length > 0) {
        setActiveEpisodeId(importedData.episodes[0].id);
        if (importedData.episodes[0].scenes.length > 0) {
          setActiveSceneId(importedData.episodes[0].scenes[0].id);
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
    // Create default scene with 12 empty shots
    const createDefaultShot = (index: number): Shot => ({
      id: generateId(),
      shotNumber: index + 1,
      description: '',
      ert: '',
      duration: 0,
      notes: '',
      size: '',
      perspective: '',
      movement: '',
      equipment: '',
      focalLength: '',
      aspectRatio: DEFAULT_ASPECT_RATIO,
    });
    
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
        shots: Array.from({ length: 12 }, (_, index) => createDefaultShot(index))
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

      // Create 12 empty shots by default
      const defaultShots: Shot[] = Array.from({ length: 12 }, (_, index) => ({
        ...createShot(null),
        shotNumber: index + 1
      }));

      const newScene: Scene = {
        id: generateId(),
        sceneNumber: nextSceneNumber,
        intExt: 'INT.',
        location: '',
        time: 'DAY',
        shots: defaultShots
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
      ert: inheritFrom?.ert || '', 
      duration: inheritFrom?.duration || 0,
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
    const savedGeminiApiKey = getGeminiApiKey();
    setGeminiApiKeyInput(savedGeminiApiKey || '');
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = () => {
    if (apiKeyInput.trim()) {
      saveApiKey(apiKeyInput.trim());
    }
    if (geminiApiKeyInput.trim()) {
      saveGeminiApiKey(geminiApiKeyInput.trim());
    }
    setIsSettingsOpen(false);
  };

  const handleAnalyzeScript = async () => {
    if (!scriptText.trim()) {
      alert('Please enter script text to analyze.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await analyzeScriptContext(scriptText);
      
      if (result.error) {
        alert(`Analysis failed: ${result.error}`);
      } else {
        setKeywords(result.keywords);
        saveKeywords(result.keywords);
        // Switch to keywords tab after successful analysis
        setProjectSettingsTab('keywords');
        alert(`Successfully extracted ${result.keywords.length} entities!`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleEditKeyword = (index: number) => {
    setEditingKeywordIndex(index);
    setEditingKeyword({ ...keywords[index] });
  };

  const handleSaveKeyword = (index: number) => {
    if (!editingKeyword) return;
    
    const updatedKeywords = [...keywords];
    updatedKeywords[index] = editingKeyword;
    setKeywords(updatedKeywords);
    saveKeywords(updatedKeywords);
    setEditingKeywordIndex(null);
    setEditingKeyword(null);
  };

  const handleDeleteKeyword = (index: number) => {
    if (confirm('确定要删除这个关键词吗？')) {
      const updatedKeywords = keywords.filter((_, i) => i !== index);
      setKeywords(updatedKeywords);
      saveKeywords(updatedKeywords);
    }
  };

  const handleCancelEdit = () => {
    setEditingKeywordIndex(null);
    setEditingKeyword(null);
  };

  const handleOpenProjectSettings = () => {
    setIsProjectSettingsOpen(true);
  };

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle CMD+Enter if not in a textarea or input
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        // Let the textarea handle it
        return;
      }
      
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
          <div className="flex-1 px-1 space-y-0.5 pb-3 overflow-hidden">
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
            {/* Add Scene button inside scene list */}
            <button 
              onClick={addScene}
              className="w-full flex items-center justify-center space-x-2 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white py-1.5 rounded text-xs font-medium transition-colors border border-zinc-700 border-dashed mx-1"
            >
              <Plus size={14} />
              <span>{t('addScene')}</span>
            </button>
          </div>
        </div>

        {/* Settings button in bottom left */}
        <div className="p-3 border-t border-zinc-800">
          <button 
            onClick={handleOpenSettings}
            className="w-full flex items-center justify-center space-x-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 py-1.5 rounded text-xs font-medium transition-colors border border-zinc-800"
          >
            <Settings size={14} />
            <span>{t('settings')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-zinc-950">
        
        {/* Header */}
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950 flex-shrink-0 z-10">
          <div className="flex items-center space-x-4">
             <input
               type="text"
               value={projectTitle}
               onChange={(e) => setProjectTitle(e.target.value)}
               className="text-lg font-bold text-zinc-100 bg-transparent border-none outline-none focus:text-cyan-400 transition-colors px-2 py-1 rounded hover:bg-zinc-900 focus:bg-zinc-900"
               placeholder="项目名称"
             />
          </div>
          
          <div className="flex items-center space-x-3">
             {/* AI Autocomplete Toggle */}
             <button
              onClick={() => setIsAutocompleteEnabled(!isAutocompleteEnabled)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all border ${
                isAutocompleteEnabled
                  ? 'bg-gradient-to-r from-purple-600/20 to-cyan-600/20 hover:from-purple-600/30 hover:to-cyan-600/30 text-cyan-400 border-purple-500/50 hover:border-purple-400/70 shadow-lg shadow-purple-500/20'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-400 border-zinc-800'
              }`}
              title={isAutocompleteEnabled ? '关闭AI自动补全' : '开启AI自动补全'}
             >
               <Sparkles size={14} className={isAutocompleteEnabled ? 'text-cyan-400' : 'text-zinc-500'} />
               <span>{isAutocompleteEnabled ? 'AI补全' : 'AI补全'}</span>
             </button>

             <div className="w-px h-6 bg-zinc-800 mx-1"></div>

             {/* Project Settings */}
             <button
              onClick={handleOpenProjectSettings}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800"
              title="项目配置"
             >
               <Settings size={14} />
               <span>项目配置</span>
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

        {/* Scene Info Bar */}
        <div className="bg-zinc-950 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          {/* Episode and Scene Info - First Row */}
          <div className="flex items-center space-x-6 mb-3">
            {/* Episode Info */}
            <div className="flex items-center space-x-3">
              <span className="text-xs text-cyan-500 font-bold tracking-wide">{activeEpisode.title}</span>
              {episodeTotalDuration > 0 && (
                <>
                  <span className="text-xs text-zinc-600">·</span>
                  <span className="text-xs text-zinc-400">
                    总时长 {episodeTotalMinutes} 分钟
                  </span>
                </>
              )}
            </div>
            
            {/* Scene Info */}
            <div className="flex items-center space-x-3 pl-6 border-l border-zinc-800">
              <h2 className="text-xs font-bold text-zinc-100">
                {t('scene')} {activeScene.sceneNumber}
              </h2>
              <span className="text-xs text-zinc-600">·</span>
              <span className="text-xs text-zinc-400">
                镜头总数 {activeScene.shots.length}
              </span>
              {sceneTotalDuration > 0 && (
                <>
                  <span className="text-xs text-zinc-600">·</span>
                  <span className="text-xs text-zinc-400">
                    场景时长 {sceneTotalDuration.toFixed(1)} 秒
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Scene Config - Second Row */}
          <div className="flex items-end justify-between">
            <div className="flex items-end gap-3">
              <div className="w-28">
                <label className="block text-[10px] font-medium text-zinc-500 mb-1.5">{t('header')}</label>
                <select 
                  value={activeScene.intExt}
                  onChange={(e) => updateScene(activeScene.id, 'intExt', e.target.value)}
                  className={`${InputClass} w-full appearance-none`}
                >
                  {INT_EXT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>
                      {getIntExtLabel(opt, langMode)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="flex-1 max-w-md">
                <label className="block text-[10px] font-medium text-zinc-500 mb-1.5">{t('sceneHeading')}</label>
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
              
              <div className="w-28">
                <label className="block text-[10px] font-medium text-zinc-500 mb-1.5">{t('time')}</label>
                <select 
                  value={activeScene.time}
                  onChange={(e) => updateScene(activeScene.id, 'time', e.target.value)}
                  className={`${InputClass} w-full appearance-none`}
                >
                  {TIMES.map(opt => (
                    <option key={opt} value={opt}>
                      {getTimeLabel(opt, langMode)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Sketch View Toggle */}
            <button
              onClick={() => setIsSketchExpanded(!isSketchExpanded)}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800"
              title={isSketchExpanded ? '收起草图' : '展开草图'}
            >
              {isSketchExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{isSketchExpanded ? '收起' : '展开'}</span>
            </button>
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
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-20 text-center">{t('ert')}</th>
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
                  {activeScene.shots.map((shot, index) => {
                    const previousShot = index > 0 ? activeScene.shots[index - 1] : undefined;
                    return (
                      <ShotRow 
                        key={shot.id}
                        shot={shot} 
                        onChange={updateShot} 
                        onDelete={deleteShot}
                        onInsert={insertShot}
                        onAddShot={addShot}
                        langMode={langMode}
                        shouldAutoFocus={shot.id === lastAddedShotId}
                        sceneLocation={activeScene.location}
                        sceneTime={activeScene.time}
                        isSketchExpanded={isSketchExpanded}
                        isAutocompleteEnabled={isAutocompleteEnabled}
                        keywords={keywords}
                        previousShot={previousShot ? { size: previousShot.size, movement: previousShot.movement } : undefined}
                      />
                    );
                  })}
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
                <label className={LabelClass}>语言 / Language</label>
                <div className="flex items-center space-x-2 mt-2">
                  {[
                    { mode: 'zh', label: '中文' },
                    { mode: 'en', label: 'English' },
                    { mode: 'bi', label: '中英双语' }
                  ].map(({ mode, label }) => (
                    <button 
                      key={mode}
                      onClick={() => setLangMode(mode as LanguageMode)} 
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded transition-all ${
                        langMode === mode 
                          ? 'bg-cyan-600 text-white' 
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-500 mt-2">
                  选择界面显示语言
                </p>
              </div>

              <div className="h-px bg-zinc-800"></div>

              <div>
                <label className={LabelClass}>Doubao API Key (图像生成)</label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Enter Doubao API Key for image generation"
                  className={`${InputClass} w-full`}
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Used for generating storyboard sketches.
                </p>
              </div>

              <div>
                <label className={LabelClass}>文本分析使用 Doubao API Key</label>
                <p className="text-[10px] text-zinc-500 mt-1">
                  文本分析功能使用与图像生成相同的 Doubao API Key，通过 DeepSeek v3.2 模型进行分析。
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

      {/* Project Settings Modal */}
      {isProjectSettingsOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4"
          onClick={() => setIsProjectSettingsOpen(false)}
        >
          <div 
            className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-100">项目设置 - 脚本上下文</h3>
              <button
                onClick={() => setIsProjectSettingsOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800">
              <button
                onClick={() => setProjectSettingsTab('script')}
                className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                  projectSettingsTab === 'script'
                    ? 'text-cyan-400 border-b-2 border-cyan-400 bg-zinc-800/50'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                脚本分析
              </button>
              <button
                onClick={() => setProjectSettingsTab('keywords')}
                className={`flex-1 px-6 py-3 text-sm font-medium transition-colors relative ${
                  projectSettingsTab === 'keywords'
                    ? 'text-cyan-400 border-b-2 border-cyan-400 bg-zinc-800/50'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                关键词管理
                {keywords.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-cyan-600 text-white text-xs rounded-full">
                    {keywords.length}
                  </span>
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {projectSettingsTab === 'script' ? (
                <div className="space-y-4">
                  <div>
                    <label className={LabelClass}>粘贴脚本/大纲</label>
                    <textarea
                      value={scriptText}
                      onChange={(e) => setScriptText(e.target.value)}
                      placeholder="在这里粘贴您的脚本或大纲文本..."
                      className={`${InputClass} w-full h-64 resize-y`}
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      AI 将提取关键实体（角色、地点、物品）用于自动完成。
                    </p>
                  </div>

                  <button
                    onClick={handleAnalyzeScript}
                    disabled={isAnalyzing || !scriptText.trim()}
                    className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded text-sm font-medium transition-all"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>分析中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>✨ 分析上下文</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {keywords.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-zinc-400 text-sm mb-2">还没有提取关键词</p>
                      <p className="text-zinc-500 text-xs">请在"脚本分析"标签页中分析脚本以提取关键词</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <label className={LabelClass}>已提取的关键词 ({keywords.length})</label>
                        <p className="text-[10px] text-zinc-500">
                          在镜头描述中输入关键词名称即可自动完成
                        </p>
                      </div>
                      <div className="space-y-3">
                        {keywords.map((keyword, index) => (
                          <div key={index} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                            {editingKeywordIndex === index ? (
                              <div className="space-y-3">
                                <div>
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">
                                    名称
                                  </label>
                                  <input
                                    type="text"
                                    value={editingKeyword?.name || ''}
                                    onChange={(e) => setEditingKeyword({ ...editingKeyword!, name: e.target.value })}
                                    className={`${InputClass} w-full`}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">
                                    类别
                                  </label>
                                  <select
                                    value={editingKeyword?.category || 'Character'}
                                    onChange={(e) => setEditingKeyword({ ...editingKeyword!, category: e.target.value as 'Character' | 'Location' | 'Item' })}
                                    className={`${InputClass} w-full`}
                                  >
                                    <option value="Character">角色</option>
                                    <option value="Location">地点</option>
                                    <option value="Item">物品</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 block">
                                    视觉特征
                                  </label>
                                  <textarea
                                    value={editingKeyword?.visual_traits || ''}
                                    onChange={(e) => setEditingKeyword({ ...editingKeyword!, visual_traits: e.target.value })}
                                    placeholder="描述视觉特征..."
                                    className={`${InputClass} w-full h-20 resize-y`}
                                  />
                                </div>
                                <div className="flex items-center justify-end space-x-2 pt-2">
                                  <button
                                    onClick={handleCancelEdit}
                                    className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                                  >
                                    取消
                                  </button>
                                  <button
                                    onClick={() => handleSaveKeyword(index)}
                                    className="px-3 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors"
                                  >
                                    保存
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-2">
                                    <span className="text-sm font-medium text-zinc-100">{keyword.name}</span>
                                    <span className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                                      {keyword.category === 'Character' ? '角色' : keyword.category === 'Location' ? '地点' : '物品'}
                                    </span>
                                  </div>
                                  {keyword.visual_traits && (
                                    <p className="text-xs text-zinc-400">{keyword.visual_traits}</p>
                                  )}
                                </div>
                                <div className="flex items-center space-x-2 ml-4">
                                  <button
                                    onClick={() => handleEditKeyword(index)}
                                    className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded transition-colors"
                                    title="编辑"
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteKeyword(index)}
                                    className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                                    title="删除"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
