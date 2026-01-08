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
  X,
  CheckSquare,
  Tag
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

import { Scene, Shot, SceneField, ShotField, Episode, LanguageMode, FieldSettings, DefaultValueType } from './types';
import { 
  INT_EXT_OPTIONS, 
  TIMES, 
  DEFAULT_ASPECT_RATIO, 
  UI_LABELS, 
  getUIText, 
  getIntExtLabel, 
  getTimeLabel,
  SHOT_SIZES,
  PERSPECTIVES,
  MOVEMENTS,
  EQUIPMENT,
  FOCAL_LENGTHS,
  getLabel
} from './constants';
import { ShotRow, FocusableField } from './components/ShotRow';
import { RayShotLogo } from './components/RayShotLogo';
import { SceneElementsConfig } from './components/SceneElementsConfig';
import { exportToExcel } from './services/excelService';
import { 
  saveToLocalStorage, 
  loadFromLocalStorage, 
  exportProjectFile, 
  parseProjectFile,
  saveKeywords,
  loadKeywords
} from './services/storageService';
import { getApiKey, saveApiKey, getGeminiApiKey, saveGeminiApiKey, analyzeScriptContext, extractDialoguesAndEffects } from './services/geminiService';
import { ProjectKeyword } from './types';

const App: React.FC = () => {
  // --- State ---
  const [projectTitle, setProjectTitle] = useState<string>('未命名项目');
  const [projectAspectRatio, setProjectAspectRatio] = useState<string>(DEFAULT_ASPECT_RATIO); // 项目默认画幅
  const [langMode, setLangMode] = useState<LanguageMode>('zh');
  const [lastAddedShotId, setLastAddedShotId] = useState<string | null>(null);
  const [focusedShotId, setFocusedShotId] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<FocusableField>('description');
  const [isLoaded, setIsLoaded] = useState(false); // To prevent auto-save overwriting empty state on load
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null);
  const [isBatchEditMode, setIsBatchEditMode] = useState(false);
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(new Set());
  const [batchEditValues, setBatchEditValues] = useState<Partial<Record<keyof Shot, string>>>({});
  const [batchAddCount, setBatchAddCount] = useState<string>('');
  const [batchAddError, setBatchAddError] = useState(false);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [isElementsConfigOpen, setIsElementsConfigOpen] = useState(false);
  const [isExtractingDialogues, setIsExtractingDialogues] = useState(false);
  
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
  const [projectSettingsTab, setProjectSettingsTab] = useState<'script' | 'keywords' | 'project'>('script');
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
  const [isFieldSettingsOpen, setIsFieldSettingsOpen] = useState<boolean>(false);
  const [fieldSettings, setFieldSettings] = useState<FieldSettings>(() => {
    // 默认所有字段都显示，默认值为空缺
    // 默认只有时长(ert)允许AI补全
    const defaultConfig = {
      visible: true,
      defaultValueType: 'empty' as DefaultValueType,
      customValue: undefined,
      allowAI: false
    };
    return {
      description: { ...defaultConfig },
      ert: { ...defaultConfig, allowAI: true }, // 默认只有时长允许AI补全
      size: { ...defaultConfig },
      perspective: { ...defaultConfig },
      movement: { ...defaultConfig },
      equipment: { ...defaultConfig },
      focalLength: { ...defaultConfig },
      aspectRatio: { ...defaultConfig, visible: false, customValue: DEFAULT_ASPECT_RATIO }, // 默认画幅字段不可见
      notes: { ...defaultConfig }
    };
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Derived State ---
  const activeEpisode = episodes.find(e => e.id === activeEpisodeId) || episodes[0];
  const activeScene = activeEpisode.scenes.find(s => s.id === activeSceneId) || activeEpisode.scenes[0];
  
  // Calculate scene total duration (in seconds) from ERT field
  const sceneTotalDuration = activeScene.shots.reduce((sum, shot) => {
    const ertValue = parseFloat(shot.ert) || 0;
    return sum + ertValue;
  }, 0);

  // Format duration display: < 120s shows as seconds, >= 120s shows as minutes and seconds
  const formatDuration = (seconds: number): string => {
    if (seconds < 120) {
      return `${seconds.toFixed(1)} 秒`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes} 分钟 ${remainingSeconds} 秒`;
    }
  };
  
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
      if (savedData.projectAspectRatio) {
        setProjectAspectRatio(savedData.projectAspectRatio);
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
        aspectRatio: projectAspectRatio,
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

    const success = saveToLocalStorage(episodes, projectTitle, projectAspectRatio);
    if (success) {
      const now = new Date();
      setLastSavedTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, [episodes, projectTitle, projectAspectRatio, isLoaded]);

  // Ensure activeSceneId is valid when switching episodes
  useEffect(() => {
    const sceneExists = activeEpisode.scenes.find(s => s.id === activeSceneId);
    if (!sceneExists && activeEpisode.scenes.length > 0) {
      setActiveSceneId(activeEpisode.scenes[0].id);
    }
  }, [activeEpisodeId, activeEpisode.scenes, activeSceneId]);

  // Clear focusedShotId after it's used
  useEffect(() => {
    if (focusedShotId) {
      const timer = setTimeout(() => {
        setFocusedShotId(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [focusedShotId]);

  // Clear lastAddedShotId after it's used
  useEffect(() => {
    if (lastAddedShotId) {
      const timer = setTimeout(() => {
        setLastAddedShotId(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [lastAddedShotId]);

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
    exportProjectFile(episodes, projectTitle, projectAspectRatio);
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
      if (importedData.projectAspectRatio) {
        setProjectAspectRatio(importedData.projectAspectRatio);
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
    // 根据字段配置应用默认值
    const getDefaultValue = (field: keyof FieldSettings, inheritValue?: string): string => {
      const config = fieldSettings[field];
      if (!config) return '';
      
      if (config.defaultValueType === 'inherit' && inheritValue !== undefined && inheritValue !== '') {
        return inheritValue;
      } else if (config.defaultValueType === 'custom' && config.customValue !== undefined) {
        return config.customValue;
      } else {
        return ''; // empty
      }
    };
    
    return {
      id: generateId(),
      shotNumber: 0, 
      description: getDefaultValue('description', inheritFrom?.description),
      ert: getDefaultValue('ert', inheritFrom?.ert),
      duration: inheritFrom?.duration || 0,
      notes: getDefaultValue('notes', inheritFrom?.notes),
      size: getDefaultValue('size', inheritFrom?.size),
      perspective: getDefaultValue('perspective', inheritFrom?.perspective),
      movement: getDefaultValue('movement', inheritFrom?.movement),
      equipment: getDefaultValue('equipment', inheritFrom?.equipment),
      focalLength: getDefaultValue('focalLength', inheritFrom?.focalLength),
      aspectRatio: (() => {
        const value = getDefaultValue('aspectRatio', inheritFrom?.aspectRatio);
        // 如果返回空字符串且不是明确设置为empty，则使用项目设置的画幅
        if (value === '' && fieldSettings.aspectRatio?.defaultValueType !== 'empty') {
          return projectAspectRatio;
        }
        return value || projectAspectRatio;
      })(),
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
  }, [activeEpisodeId, activeSceneId, fieldSettings]);

  const addMultipleShots = useCallback((count: number) => {
    if (count < 2 || count > 50) return;
    
    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      return {
        ...ep,
        scenes: ep.scenes.map(scene => {
          if (scene.id !== activeSceneId) return scene;
          
          const lastShot = scene.shots.length > 0 ? scene.shots[scene.shots.length - 1] : null;
          const newShots: Shot[] = [];
          
          // Create multiple shots
          for (let i = 0; i < count; i++) {
            const inheritFrom = i === 0 ? lastShot : newShots[newShots.length - 1];
            newShots.push(createShot(inheritFrom));
          }
          
          const allShots = reindexShots([...scene.shots, ...newShots]);
          
          // Focus on the first new shot
          if (newShots.length > 0) {
            setLastAddedShotId(newShots[0].id);
          }
          
          return { ...scene, shots: allShots };
        })
      };
    }));
    
    setBatchAddCount('');
  }, [activeEpisodeId, activeSceneId, fieldSettings]);

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

  // 提取对白和特效文字
  const handleExtractDialogues = useCallback(async () => {
    if (!activeScene || activeScene.shots.length === 0) {
      alert('当前场景没有镜头，无法提取对白和特效文字。');
      return;
    }

    setIsExtractingDialogues(true);
    try {
      // 准备画面描述数据
      const shotDescriptions = activeScene.shots.map(shot => ({
        shotNumber: shot.shotNumber,
        description: shot.description
      }));

      // 调用AI提取
      const result = await extractDialoguesAndEffects(
        shotDescriptions,
        activeScene.location,
        activeScene.outline,
        activeScene.elements,
        keywords
      );

      if (result.error) {
        alert(`提取失败：${result.error}`);
        return;
      }

      if (result.extractions.length === 0) {
        alert('未找到对白或特效文字。');
        return;
      }

      // 将提取的内容追加到对应镜头的备注中
      setEpisodes(prev => prev.map(ep => {
        if (ep.id !== activeEpisodeId) return ep;
        return {
          ...ep,
          scenes: ep.scenes.map(scene => {
            if (scene.id !== activeSceneId) return scene;
            return {
              ...scene,
              shots: scene.shots.map(shot => {
                const extraction = result.extractions.find(ext => ext.shotNumber === shot.shotNumber);
                if (!extraction || (!extraction.dialogue && !extraction.effects)) {
                  return shot;
                }

                // 构建要追加的内容
                const parts: string[] = [];
                if (extraction.dialogue) {
                  parts.push(extraction.dialogue);
                }
                if (extraction.effects) {
                  parts.push(extraction.effects);
                }

                const newContent = parts.join('\n');
                
                // 追加到备注（如果原来有内容，先换行再追加）
                const updatedNotes = shot.notes 
                  ? `${shot.notes}\n${newContent}`
                  : newContent;

                return { ...shot, notes: updatedNotes };
              })
            };
          })
        };
      }));

      alert(`成功提取 ${result.extractions.length} 个镜头的对白和特效文字。`);
    } catch (error: any) {
      alert(`提取失败：${error.message || '未知错误'}`);
    } finally {
      setIsExtractingDialogues(false);
    }
  }, [activeScene, activeEpisodeId, activeSceneId, keywords]);

  // Batch operations
  const handleBatchDelete = useCallback(() => {
    if (selectedShotIds.size === 0) return;
    setEpisodes(prev => prev.map(ep => {
      if (ep.id !== activeEpisodeId) return ep;
      return {
        ...ep,
        scenes: ep.scenes.map(scene => {
          if (scene.id !== activeSceneId) return scene;
          const filteredShots = scene.shots.filter(s => !selectedShotIds.has(s.id));
          return { ...scene, shots: reindexShots(filteredShots) };
        })
      };
    }));
    setSelectedShotIds(new Set());
  }, [selectedShotIds, activeEpisodeId, activeSceneId]);


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

          // If in batch edit mode and dragging a selected shot, move all selected shots together
          if (isBatchEditMode && selectedShotIds.size > 1 && selectedShotIds.has(active.id as string)) {
            const selectedShots = scene.shots.filter(s => selectedShotIds.has(s.id));
            const unselectedShots = scene.shots.filter(s => !selectedShotIds.has(s.id));
            
            // Calculate new position for selected shots
            const insertIndex = newIndex > oldIndex ? newIndex - selectedShots.length + 1 : newIndex;
            
            // Insert selected shots at new position
            const newShots = [...unselectedShots];
            newShots.splice(insertIndex, 0, ...selectedShots);
            
            return { ...scene, shots: reindexShots(newShots) };
          } else {
            // Normal single shot drag
          const reorderedShots = arrayMove(scene.shots, oldIndex, newIndex);
          return { ...scene, shots: reindexShots(reorderedShots) };
          }
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

  // Handle mouse drag selection end
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragSelecting(false);
    };

    if (isDragSelecting) {
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragSelecting]);

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
            {episodes.map(ep => {
              const isEditing = editingEpisodeId === ep.id;
              return (
              <div 
                key={ep.id}
                  onClick={() => {
                    if (!isEditing) {
                      setActiveEpisodeId(ep.id);
                    }
                  }}
                className={`
                    group flex items-center space-x-2 px-2 py-1.5 rounded text-xs transition-all
                  ${activeEpisodeId === ep.id ? 'bg-zinc-800 text-cyan-400 border-l-2 border-cyan-500' : 'text-zinc-400 hover:bg-zinc-900'}
                    ${!isEditing ? 'cursor-pointer' : ''}
                `}
              >
                  <MonitorPlay size={12} className="flex-shrink-0" />
                  {isEditing ? (
                <input 
                      className="bg-transparent border-none outline-none flex-1 text-xs focus:ring-1 focus:ring-cyan-500 rounded px-1"
                  value={ep.title}
                  onChange={(e) => updateEpisodeTitle(ep.id, e.target.value)}
                      autoFocus
                      onBlur={() => setEditingEpisodeId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingEpisodeId(null);
                        }
                        if (e.key === 'Escape') {
                          setEditingEpisodeId(null);
                        }
                      }}
                    />
                  ) : (
                    <span className="flex-1 text-xs">{ep.title}</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingEpisodeId(isEditing ? null : ep.id);
                    }}
                    className={`flex-shrink-0 p-1 hover:bg-zinc-700 rounded transition-all ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    title={isEditing ? '完成' : '编辑'}
                  >
                    {isEditing ? <X size={12} /> : <Edit2 size={12} />}
                  </button>
              </div>
              );
            })}
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
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-950 flex-shrink-0 z-10 min-w-0">
          <div className="flex items-center space-x-4 min-w-0 flex-shrink">
             <input
               type="text"
               value={projectTitle}
               onChange={(e) => setProjectTitle(e.target.value)}
               className="text-lg font-bold text-zinc-100 bg-transparent border-none outline-none focus:text-cyan-400 transition-colors px-2 py-1 rounded hover:bg-zinc-900 focus:bg-zinc-900 min-w-0 flex-shrink"
               placeholder="项目名称"
             />
          </div>
          
          <div className="flex items-center space-x-3 flex-shrink-0">
             {/* AI Autocomplete Toggle */}
             <button
              onClick={() => setIsAutocompleteEnabled(!isAutocompleteEnabled)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all border flex-shrink-0 whitespace-nowrap ${
                isAutocompleteEnabled
                  ? 'bg-gradient-to-r from-purple-600/20 to-cyan-600/20 hover:from-purple-600/30 hover:to-cyan-600/30 text-cyan-400 border-purple-500/50 hover:border-purple-400/70 shadow-lg shadow-purple-500/20'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-400 border-zinc-800'
              }`}
              title={isAutocompleteEnabled ? '关闭AI自动补全' : '开启AI自动补全'}
             >
               <Sparkles size={14} className={isAutocompleteEnabled ? 'text-cyan-400' : 'text-zinc-500'} />
               <span>{isAutocompleteEnabled ? 'AI补全' : 'AI补全'}</span>
             </button>

             <div className="w-px h-6 bg-zinc-800 mx-1 flex-shrink-0"></div>

             {/* Project Settings */}
             <button
              onClick={handleOpenProjectSettings}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800 flex-shrink-0 whitespace-nowrap"
              title="项目配置"
             >
               <Settings size={14} />
               <span>项目配置</span>
             </button>

             <div className="w-px h-6 bg-zinc-800 mx-1 flex-shrink-0"></div>

             {/* Open Project */}
             <button
              onClick={handleOpenProjectClick}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800 flex-shrink-0 whitespace-nowrap"
              title="Open Project File (.ray)"
             >
               <FolderOpen size={14} />
               <span>Open</span>
             </button>

             {/* Save Project */}
             <button
              onClick={handleSaveProject}
              className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800 flex-shrink-0 whitespace-nowrap"
              title="Save Project File (.ray)"
             >
               <Save size={14} />
               <span>Save</span>
             </button>

             <div className="w-px h-6 bg-zinc-800 mx-1 flex-shrink-0"></div>

            <div className="relative flex-shrink-0">
              <button 
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="flex items-center space-x-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-700 whitespace-nowrap"
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
          <div className="flex items-center space-x-6 mb-3 min-w-0 overflow-hidden">
            {/* Episode Info */}
            <div className="flex items-center space-x-3 min-w-0 flex-shrink-0">
              <span className="text-xs text-cyan-500 font-bold tracking-wide whitespace-nowrap">{activeEpisode.title}</span>
              {episodeTotalDuration > 0 && (
                <>
                  <span className="text-xs text-zinc-600 flex-shrink-0">·</span>
                  <span className="text-xs text-zinc-400 whitespace-nowrap">
                    总时长 {episodeTotalMinutes} 分钟
                  </span>
                </>
              )}
            </div>
            
            {/* Scene Info */}
            <div className="flex items-center space-x-3 pl-6 border-l border-zinc-800 min-w-0 flex-shrink-0">
              <h2 className="text-xs font-bold text-zinc-100 whitespace-nowrap">
                {t('scene')} {activeScene.sceneNumber}
              </h2>
              <span className="text-xs text-zinc-600 flex-shrink-0">·</span>
              <span className="text-xs text-zinc-400 whitespace-nowrap">
                镜头总数 {activeScene.shots.length}
              </span>
              {sceneTotalDuration > 0 && (
                <>
                  <span className="text-xs text-zinc-600 flex-shrink-0">·</span>
                  <span className="text-xs text-zinc-400 whitespace-nowrap">
                    场景时长 {formatDuration(sceneTotalDuration)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Scene Config - Second Row */}
          <div className="flex items-end justify-between min-w-0 overflow-hidden">
            <div className="flex items-end gap-3 min-w-0 flex-shrink-0">
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
              
              {/* 要素配置按钮 */}
              <button
                onClick={() => setIsElementsConfigOpen(true)}
                className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800 flex-shrink-0 whitespace-nowrap"
                title="要素配置"
              >
                <Tag size={14} />
                <span>要素配置</span>
                {activeScene.elements && activeScene.elements.length > 0 && (
                  <span className="bg-cyan-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {activeScene.elements.length}
                  </span>
                )}
              </button>

              {/* AI Extract Button */}
              <button
                onClick={handleExtractDialogues}
                disabled={isExtractingDialogues || !activeScene || activeScene.shots.length === 0}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition-all shadow-lg hover:shadow-xl disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                title="基于场景大纲、关键词和要素配置，自动提取该场景内所有镜头的对白和特效文字"
              >
                {isExtractingDialogues ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>提取中</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>AI提取</span>
                  </>
                )}
              </button>
              </div>
            
            {/* Second Row: Column Settings, Sketch View Toggle, Batch Edit Toggle */}
            <div className="flex items-center justify-end space-x-2 flex-shrink-0">
              {/* Column Settings Button */}
              <button
                onClick={() => setIsFieldSettingsOpen(true)}
                className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800 flex-shrink-0 whitespace-nowrap"
                title="列设置"
              >
                <Settings size={14} />
                <span>列设置</span>
              </button>
              
              {/* Sketch View Toggle */}
              <button
                onClick={() => setIsSketchExpanded(!isSketchExpanded)}
                className="flex items-center space-x-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 px-3 py-1.5 rounded text-xs font-medium transition-all border border-zinc-800 flex-shrink-0 whitespace-nowrap"
                title={isSketchExpanded ? '收起草图' : '展开草图'}
              >
                {isSketchExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{isSketchExpanded ? '收起' : '展开'}</span>
              </button>

              {/* Batch Edit Toggle */}
              <button
                onClick={() => {
                  setIsBatchEditMode(!isBatchEditMode);
                  if (isBatchEditMode) {
                    setSelectedShotIds(new Set());
                    setBatchEditValues({});
                  }
                }}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all border flex-shrink-0 whitespace-nowrap ${
                  isBatchEditMode 
                    ? 'bg-cyan-900 hover:bg-cyan-800 text-cyan-400 border-cyan-700' 
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 border-zinc-800'
                }`}
                title={isBatchEditMode ? '退出批量编辑' : '批量编辑'}
              >
                <CheckSquare size={14} />
                <span>{isBatchEditMode ? '退出批量编辑' : '批量编辑'}</span>
              </button>
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
            {isBatchEditMode && (
                <div className="sticky top-0 z-20 pt-1 pb-1 bg-zinc-950/90 backdrop-blur-sm">
                  <div className="text-xs font-bold text-zinc-400 mb-3 hidden">批量操作栏</div>
                  <table className="w-full text-left border-collapse table-fixed">
                    <tbody>
                      <tr>
                        <td className="p-1 w-8"></td>
                        <td className="p-1 w-8"></td>
                        {fieldSettings.description.visible && (
                          <td className="p-1 w-64">
                            <input
                              type="text"
                              value={batchEditValues.description || ''}
                              onChange={(e) => setBatchEditValues(prev => ({ ...prev, description: e.target.value }))}
                              onBlur={() => {
                                if (batchEditValues.description && selectedShotIds.size > 0) {
                                  setEpisodes(prev => prev.map(ep => {
                                    if (ep.id !== activeEpisodeId) return ep;
                                    return {
                                      ...ep,
                                      scenes: ep.scenes.map(scene => {
                                        if (scene.id !== activeSceneId) return scene;
                                        return {
                                          ...scene,
                                          shots: scene.shots.map(shot => {
                                            if (selectedShotIds.has(shot.id)) {
                                              return { ...shot, description: batchEditValues.description || '' };
                                            }
                                            return shot;
                                          })
                                        };
                                      })
                                    };
                                  }));
                                  setBatchEditValues(prev => ({ ...prev, description: '' }));
                                }
                              }}
                              placeholder="批量编辑..."
                              className="w-full px-1.5 bg-cyan-950/90 border border-cyan-700/50 rounded text-xs text-cyan-200 placeholder-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              style={{ 
                                height: '40px',
                                lineHeight: '40px'
                              }}
                            />
                          </td>
                        )}
                        {fieldSettings.ert.visible && (
                          <td className="p-1 w-9 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <input
                                type="text"
                                value={batchEditValues.ert || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value === '' || /^\d+$/.test(value)) {
                                    setBatchEditValues(prev => ({ ...prev, ert: value }));
                                  }
                                }}
                                onBlur={() => {
                                  if (batchEditValues.ert && selectedShotIds.size > 0) {
                                    setEpisodes(prev => prev.map(ep => {
                                      if (ep.id !== activeEpisodeId) return ep;
                                      return {
                                        ...ep,
                                        scenes: ep.scenes.map(scene => {
                                          if (scene.id !== activeSceneId) return scene;
                                          return {
                                            ...scene,
                                            shots: scene.shots.map(shot => {
                                              if (selectedShotIds.has(shot.id)) {
                                                return { ...shot, ert: batchEditValues.ert || '' };
                                              }
                                              return shot;
                                            })
                                          };
                                        })
                                      };
                                    }));
                                    setBatchEditValues(prev => ({ ...prev, ert: '' }));
                                  }
                                }}
                                placeholder="0"
                                className="text-center bg-cyan-950/90 border border-cyan-700/50 rounded text-xs text-cyan-200 placeholder-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                style={{ 
                                  height: '40px',
                                  lineHeight: '40px',
                                  width: '36px',
                                  minWidth: '36px',
                                  padding: '0 4px'
                                }}
                              />
                              <span className="text-[9px] text-zinc-600 flex-shrink-0">{getUIText('secondUnit', langMode)}</span>
                            </div>
                          </td>
                        )}
                        {fieldSettings.size.visible && (
                          <td className="p-1 w-28">
                            <select
                              value={batchEditValues.size || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBatchEditValues(prev => ({ ...prev, size: value }));
                                if (value && selectedShotIds.size > 0) {
                                  setEpisodes(prev => prev.map(ep => {
                                    if (ep.id !== activeEpisodeId) return ep;
                                    return {
                                      ...ep,
                                      scenes: ep.scenes.map(scene => {
                                        if (scene.id !== activeSceneId) return scene;
                                        return {
                                          ...scene,
                                          shots: scene.shots.map(shot => {
                                            if (selectedShotIds.has(shot.id)) {
                                              return { ...shot, size: value };
                                            }
                                            return shot;
                                          })
                                        };
                                      })
                                    };
                                  }));
                                  setBatchEditValues(prev => ({ ...prev, size: '' }));
                                }
                              }}
                              className="w-full px-1 bg-cyan-950/90 border border-cyan-700/50 rounded text-xs text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              style={{ 
                                height: '40px',
                                lineHeight: '40px'
                              }}
                            >
                              <option value="">-</option>
                              {SHOT_SIZES.map(opt => (
                                <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        {fieldSettings.perspective.visible && (
                          <td className="p-1 w-28">
                            <select
                              value={batchEditValues.perspective || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBatchEditValues(prev => ({ ...prev, perspective: value }));
                                if (value && selectedShotIds.size > 0) {
                                  setEpisodes(prev => prev.map(ep => {
                                    if (ep.id !== activeEpisodeId) return ep;
                                    return {
                                      ...ep,
                                      scenes: ep.scenes.map(scene => {
                                        if (scene.id !== activeSceneId) return scene;
                                        return {
                                          ...scene,
                                          shots: scene.shots.map(shot => {
                                            if (selectedShotIds.has(shot.id)) {
                                              return { ...shot, perspective: value };
                                            }
                                            return shot;
                                          })
                                        };
                                      })
                                    };
                                  }));
                                  setBatchEditValues(prev => ({ ...prev, perspective: '' }));
                                }
                              }}
                              className="w-full px-1 bg-cyan-950/90 border border-cyan-700/50 rounded text-xs text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              style={{ 
                                height: '40px',
                                lineHeight: '40px'
                              }}
                            >
                              <option value="">-</option>
                              {PERSPECTIVES.map(opt => (
                                <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        {fieldSettings.movement.visible && (
                          <td className="p-1 w-28">
                            <select
                              value={batchEditValues.movement || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBatchEditValues(prev => ({ ...prev, movement: value }));
                                if (value && selectedShotIds.size > 0) {
                                  setEpisodes(prev => prev.map(ep => {
                                    if (ep.id !== activeEpisodeId) return ep;
                                    return {
                                      ...ep,
                                      scenes: ep.scenes.map(scene => {
                                        if (scene.id !== activeSceneId) return scene;
                                        return {
                                          ...scene,
                                          shots: scene.shots.map(shot => {
                                            if (selectedShotIds.has(shot.id)) {
                                              return { ...shot, movement: value };
                                            }
                                            return shot;
                                          })
                                        };
                                      })
                                    };
                                  }));
                                  setBatchEditValues(prev => ({ ...prev, movement: '' }));
                                }
                              }}
                              className="w-full px-1 bg-cyan-950/90 border border-cyan-700/50 rounded text-xs text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              style={{ 
                                height: '40px',
                                lineHeight: '40px'
                              }}
                            >
                              <option value="">-</option>
                              {MOVEMENTS.map(opt => (
                                <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        {fieldSettings.equipment.visible && (
                          <td className="p-1 w-24">
                            <select
                              value={batchEditValues.equipment || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBatchEditValues(prev => ({ ...prev, equipment: value }));
                                if (value && selectedShotIds.size > 0) {
                                  setEpisodes(prev => prev.map(ep => {
                                    if (ep.id !== activeEpisodeId) return ep;
                                    return {
                                      ...ep,
                                      scenes: ep.scenes.map(scene => {
                                        if (scene.id !== activeSceneId) return scene;
                                        return {
                                          ...scene,
                                          shots: scene.shots.map(shot => {
                                            if (selectedShotIds.has(shot.id)) {
                                              return { ...shot, equipment: value };
                                            }
                                            return shot;
                                          })
                                        };
                                      })
                                    };
                                  }));
                                  setBatchEditValues(prev => ({ ...prev, equipment: '' }));
                                }
                              }}
                              className="w-full px-1 bg-cyan-950/90 border border-cyan-700/50 rounded text-xs text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              style={{ 
                                height: '40px',
                                lineHeight: '40px'
                              }}
                            >
                              <option value="">-</option>
                              {EQUIPMENT.map(opt => (
                                <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        {fieldSettings.focalLength.visible && (
                          <td className="p-1 w-32">
                            <select
                              value={batchEditValues.focalLength || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setBatchEditValues(prev => ({ ...prev, focalLength: value }));
                                if (value && selectedShotIds.size > 0) {
                                  setEpisodes(prev => prev.map(ep => {
                                    if (ep.id !== activeEpisodeId) return ep;
                                    return {
                                      ...ep,
                                      scenes: ep.scenes.map(scene => {
                                        if (scene.id !== activeSceneId) return scene;
                                        return {
                                          ...scene,
                                          shots: scene.shots.map(shot => {
                                            if (selectedShotIds.has(shot.id)) {
                                              return { ...shot, focalLength: value };
                                            }
                                            return shot;
                                          })
                                        };
                                      })
                                    };
                                  }));
                                  setBatchEditValues(prev => ({ ...prev, focalLength: '' }));
                                }
                              }}
                              className="w-full px-1 bg-cyan-950/90 border border-cyan-700/50 rounded text-xs text-cyan-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              style={{ 
                                height: '40px',
                                lineHeight: '40px'
                              }}
                            >
                              <option value="">-</option>
                              {FOCAL_LENGTHS.map(opt => (
                                <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                              ))}
                            </select>
                          </td>
                        )}
                        {fieldSettings.aspectRatio.visible && (
                          <td className="p-1 w-16 text-center">
                            <input
                              type="text"
                              value={batchEditValues.aspectRatio || ''}
                              onChange={(e) => setBatchEditValues(prev => ({ ...prev, aspectRatio: e.target.value }))}
                              onBlur={() => {
                                if (batchEditValues.aspectRatio && selectedShotIds.size > 0) {
                                  setEpisodes(prev => prev.map(ep => {
                                    if (ep.id !== activeEpisodeId) return ep;
                                    return {
                                      ...ep,
                                      scenes: ep.scenes.map(scene => {
                                        if (scene.id !== activeSceneId) return scene;
                                        return {
                                          ...scene,
                                          shots: scene.shots.map(shot => {
                                            if (selectedShotIds.has(shot.id)) {
                                              return { ...shot, aspectRatio: batchEditValues.aspectRatio || '' };
                                            }
                                            return shot;
                                          })
                                        };
                                      })
                                    };
                                  }));
                                  setBatchEditValues(prev => ({ ...prev, aspectRatio: '' }));
                                }
                              }}
                              placeholder="画幅"
                              className="w-full px-1 bg-cyan-950/90 border border-cyan-700/50 rounded text-xs text-cyan-200 placeholder-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500 text-center"
                              style={{ 
                                height: '40px',
                                lineHeight: '40px'
                              }}
                            />
                          </td>
                        )}
                        {fieldSettings.notes.visible && (
                          <td className="p-1 w-40">
                            <input
                              type="text"
                              value={batchEditValues.notes || ''}
                              onChange={(e) => setBatchEditValues(prev => ({ ...prev, notes: e.target.value }))}
                              onBlur={() => {
                                if (batchEditValues.notes && selectedShotIds.size > 0) {
                                  setEpisodes(prev => prev.map(ep => {
                                    if (ep.id !== activeEpisodeId) return ep;
                                    return {
                                      ...ep,
                                      scenes: ep.scenes.map(scene => {
                                        if (scene.id !== activeSceneId) return scene;
                                        return {
                                          ...scene,
                                          shots: scene.shots.map(shot => {
                                            if (selectedShotIds.has(shot.id)) {
                                              return { ...shot, notes: batchEditValues.notes || '' };
                                            }
                                            return shot;
                                          })
                                        };
                                      })
                                    };
                                  }));
                                  setBatchEditValues(prev => ({ ...prev, notes: '' }));
                                }
                              }}
                              placeholder="批量编辑..."
                              className="w-full px-1.5 bg-cyan-950/90 border border-cyan-700/50 rounded text-xs text-cyan-200 placeholder-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              style={{ 
                                height: '40px',
                                lineHeight: '40px'
                              }}
                            />
                          </td>
                        )}
                        {isSketchExpanded && <td className="p-1 w-32"></td>}
                        <td className="p-1 w-12 text-center">
                          <button
                            onClick={() => {
                              if (selectedShotIds.size === activeScene.shots.length) {
                                setSelectedShotIds(new Set());
                              } else {
                                setSelectedShotIds(new Set(activeScene.shots.map(s => s.id)));
                              }
                            }}
                            className="w-full px-1 bg-cyan-950/90 hover:bg-cyan-950/50 border border-cyan-700/50 hover:border-cyan-600 text-cyan-300 hover:text-cyan-200 rounded text-[10px] transition-all"
                            style={{ 
                              height: '40px',
                              lineHeight: '40px'
                            }}
                            title={selectedShotIds.size === activeScene.shots.length ? '清空选择' : '全选'}
                          >
                            {selectedShotIds.size === activeScene.shots.length ? '清空' : '全选'}
                          </button>
                        </td>
                        <td className="p-1 w-12 text-center">
                          {selectedShotIds.size > 0 ? (
                            <button
                              onClick={handleBatchDelete}
                              className="w-full px-1 bg-red-900/50 hover:bg-red-900 text-red-400 hover:text-red-300 rounded text-[10px] transition-all flex items-center justify-center"
                              title="批量删除"
                              style={{ 
                                height: '40px',
                                lineHeight: '40px'
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
            )}
            <table className="w-full text-left border-collapse table-fixed">
              <thead className={`bg-zinc-900/95 backdrop-blur sticky z-30 border-b border-zinc-800 ${isBatchEditMode ? 'top-[48px]' : 'top-0'}`}>
                <tr>
                  <th className="p-1 w-8"></th>
                  <th className="p-1 text-[10px] font-bold text-zinc-500 text-center w-8">#</th>
                  {fieldSettings.description.visible && <th className="p-1 text-[10px] font-bold text-zinc-500 w-64 text-center">{t('desc')}</th>}
                  {fieldSettings.ert.visible && <th className="p-1 text-[10px] font-bold text-zinc-500 w-9 text-center">{t('ert')}</th>}
                  {fieldSettings.size.visible && <th className="p-1 text-[10px] font-bold text-zinc-500 w-28 text-center">{t('size')}</th>}
                  {fieldSettings.perspective.visible && <th className="p-1 text-[10px] font-bold text-zinc-500 w-28 text-center">{t('angle')}</th>}
                  {fieldSettings.movement.visible && <th className="p-1 text-[10px] font-bold text-zinc-500 w-28 text-center">{t('move')}</th>}
                  {fieldSettings.equipment.visible && <th className="p-1 text-[10px] font-bold text-zinc-500 w-24 text-center">{t('gear')}</th>}
                  {fieldSettings.focalLength.visible && <th className="p-1 text-[10px] font-bold text-zinc-500 w-32 text-center">{t('lens')}</th>}
                  {fieldSettings.aspectRatio.visible && <th className="p-1 text-[10px] font-bold text-zinc-500 w-16 text-center">{t('aspect')}</th>}
                  {fieldSettings.notes.visible && <th className="p-1 text-[10px] font-bold text-zinc-500 w-40 text-center">{t('notes')}</th>}
                  <th className={`p-1 text-[10px] font-bold text-zinc-500 w-32 text-center ${!isSketchExpanded ? 'hidden' : ''}`}>{t('visual')}</th>
                  {isBatchEditMode && <th className="p-1 text-[10px] font-bold text-zinc-500 w-12 text-center">选择</th>}
                  <th className="p-1 text-[10px] font-bold text-zinc-500 w-12 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                <SortableContext 
                  items={activeScene.shots.map(s => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {activeScene.shots.map((shot, index) => {
                    const previousShot = index > 0 ? activeScene.shots[index - 1] : undefined;
                    const nextShot = index < activeScene.shots.length - 1 ? activeScene.shots[index + 1] : undefined;
                    return (
                    <ShotRow 
                      key={shot.id} 
                      shot={shot} 
                      onChange={updateShot} 
                      onDelete={deleteShot}
                      onInsert={insertShot}
                      onAddShot={addShot}
                      onNavigateNext={(currentField) => {
                        if (nextShot) {
                          setFocusedShotId(nextShot.id);
                          setFocusField(currentField);
                        } else {
                          // If on last row, add new shot
                          setFocusField(currentField);
                          addShot();
                        }
                      }}
                      langMode={langMode}
                      shouldAutoFocus={shot.id === lastAddedShotId || shot.id === focusedShotId}
                      focusField={focusField}
                      sceneLocation={activeScene.location}
                      sceneTime={activeScene.time}
                      sceneOutline={activeScene.outline}
                      sceneElements={activeScene.elements}
                      isSketchExpanded={isSketchExpanded}
                      isAutocompleteEnabled={isAutocompleteEnabled}
                      keywords={keywords}
                      previousShot={previousShot ? { size: previousShot.size, movement: previousShot.movement } : undefined}
                      fieldSettings={fieldSettings}
                      isBatchEditMode={isBatchEditMode}
                      isSelected={selectedShotIds.has(shot.id)}
                      onToggleSelect={(shotId) => {
                        setSelectedShotIds(prev => {
                          const next = new Set(prev);
                          if (next.has(shotId)) {
                            next.delete(shotId);
                          } else {
                            next.add(shotId);
                          }
                          return next;
                        });
                      }}
                      isDragSelecting={isDragSelecting}
                      onDragSelectStart={() => setIsDragSelecting(true)}
                      onDragSelectEnd={() => setIsDragSelecting(false)}
                    />
                    );
                  })}
                </SortableContext>
              </tbody>
            </table>
          </DndContext>
          
          {/* Add Shot at Bottom */}
          <div className="px-4 pb-8 pt-2">
            <div className="flex items-center gap-2">
              {/* Batch Add Button */}
              <div className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 rounded px-2 py-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={batchAddCount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      setBatchAddCount(value);
                      setBatchAddError(false);
                    }
                  }}
                  className={`w-12 px-1 py-0.5 bg-zinc-800 border rounded text-xs text-zinc-200 text-center focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all ${
                    batchAddError 
                      ? 'border-red-500 bg-red-900/20 animate-shake' 
                      : 'border-zinc-700'
                  }`}
                  style={{
                    WebkitAppearance: 'none',
                    MozAppearance: 'textfield'
                  }}
                />
                <style>{`
                  input[type="text"][inputmode="numeric"]::-webkit-outer-spin-button,
                  input[type="text"][inputmode="numeric"]::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                  }
                `}</style>
                <button
                  onClick={() => {
                    const count = parseInt(batchAddCount);
                    if (!batchAddCount || isNaN(count) || count < 2 || count > 50) {
                      setBatchAddError(true);
                      setTimeout(() => setBatchAddError(false), 500);
                    } else {
                      addMultipleShots(count);
                    }
                  }}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-cyan-400 rounded text-xs transition-all flex items-center gap-1"
                  title="批量添加镜头"
                >
                  <Plus size={12} />
                  <span>批量添加</span>
                </button>
              </div>

              {/* Add Next Shot Button */}
            <button 
              onClick={addShot}
                className="flex-1 border-2 border-dashed border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300 hover:bg-zinc-900/50 py-1 rounded flex items-center justify-center transition-all group"
            >
              <Plus size={16} className="mr-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium font-mono tracking-wide">ADD NEXT SHOT</span>
            </button>
            </div>
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
              <button
                onClick={() => setProjectSettingsTab('project')}
                className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                  projectSettingsTab === 'project'
                    ? 'text-cyan-400 border-b-2 border-cyan-400 bg-zinc-800/50'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                项目配置
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
              ) : projectSettingsTab === 'keywords' ? (
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
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className={LabelClass}>项目默认画幅</label>
                    <input
                      type="text"
                      value={projectAspectRatio}
                      onChange={(e) => setProjectAspectRatio(e.target.value)}
                      placeholder="例如: 9:16, 16:9, 4:3"
                      className={`${InputClass} w-full`}
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      设置后，所有新创建的镜头将默认使用此画幅。格式：宽:高（例如：9:16, 16:9, 4:3）
                    </p>
                  </div>
                  
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                    <p className="text-xs text-zinc-400 mb-2">常用画幅比例：</p>
                    <div className="flex flex-wrap gap-2">
                      {['9:16', '16:9', '4:3', '3:4', '1:1', '21:9'].map((ratio) => (
                        <button
                          key={ratio}
                          onClick={() => setProjectAspectRatio(ratio)}
                          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                            projectAspectRatio === ratio
                              ? 'bg-cyan-600 text-white'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Field Settings Modal */}
      {isFieldSettingsOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4"
          onClick={() => setIsFieldSettingsOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <h2 className="text-lg font-bold text-zinc-100">字段设置</h2>
              <button
                onClick={() => setIsFieldSettingsOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                <p className="text-xs text-zinc-400 mb-4">
                  设置每个字段的显示状态和默认值。默认值类型：空缺 = 空值，继承 = 继承上一行的值，自定义 = 设置固定值。
                  <br />
                  AI补全：当全局AI补全功能开启时，只有勾选了"AI补全"的字段才会自动填充AI建议。默认只有"时长"字段允许AI补全。
                </p>
                
                {/* Batch Actions */}
                <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg mb-4">
                  <div className="flex items-center space-x-4">
                    <span className="text-xs text-zinc-400">批量操作：</span>
                    <button
                      onClick={() => {
                        const allVisible = Object.values(fieldSettings).every(c => c.visible);
                        setFieldSettings(prev => {
                          const newSettings = { ...prev };
                          Object.keys(newSettings).forEach(key => {
                            newSettings[key as keyof FieldSettings] = {
                              ...newSettings[key as keyof FieldSettings],
                              visible: !allVisible
                            };
                          });
                          return newSettings;
                        });
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                    >
                      {Object.values(fieldSettings).every(c => c.visible) ? '全部隐藏' : '全部显示'}
                    </button>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          setFieldSettings(prev => {
                            const newSettings = { ...prev };
                            Object.keys(newSettings).forEach(key => {
                              newSettings[key as keyof FieldSettings] = {
                                ...newSettings[key as keyof FieldSettings],
                                defaultValueType: e.target.value as DefaultValueType,
                                customValue: e.target.value === 'custom' ? newSettings[key as keyof FieldSettings].customValue : undefined
                              };
                            });
                            return newSettings;
                          });
                          e.target.value = ''; // Reset selector
                        }
                      }}
                      className={`${InputClass} text-xs py-1.5`}
                      defaultValue=""
                    >
                      <option value="">批量设置默认值类型...</option>
                      <option value="empty">全部设为：空缺</option>
                      <option value="inherit">全部设为：继承</option>
                      <option value="custom">全部设为：自定义值</option>
                    </select>
                    <button
                      onClick={() => {
                        const allAllowAI = Object.values(fieldSettings).every(c => c.allowAI);
                        setFieldSettings(prev => {
                          const newSettings = { ...prev };
                          Object.keys(newSettings).forEach(key => {
                            newSettings[key as keyof FieldSettings] = {
                              ...newSettings[key as keyof FieldSettings],
                              allowAI: !allAllowAI
                            };
                          });
                          return newSettings;
                        });
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                    >
                      {Object.values(fieldSettings).every(c => c.allowAI) ? '全部禁用AI' : '全部启用AI'}
                    </button>
                  </div>
                </div>
                
                {/* Field Settings Table */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-zinc-900 border-b border-zinc-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider w-32">字段名称</th>
                        <th className="px-4 py-2 text-center text-xs font-bold text-zinc-400 uppercase tracking-wider w-20">显示</th>
                        <th className="px-4 py-2 text-center text-xs font-bold text-zinc-400 uppercase tracking-wider w-20">AI补全</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider w-32">默认值类型</th>
                        <th className="px-4 py-2 text-left text-xs font-bold text-zinc-400 uppercase tracking-wider">自定义值</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {Object.entries(fieldSettings).map(([fieldKey, config]) => {
                        const fieldLabels: Record<string, string> = {
                          description: t('desc'),
                          ert: t('ert'),
                          size: t('size'),
                          perspective: t('angle'),
                          movement: t('move'),
                          equipment: t('gear'),
                          focalLength: t('lens'),
                          aspectRatio: t('aspect'),
                          notes: t('notes')
                        };
                        
                        const fieldLabel = fieldLabels[fieldKey] || fieldKey;
                        const isComboboxField = ['size', 'perspective', 'movement', 'equipment', 'focalLength'].includes(fieldKey);
                        
                        return (
                          <tr key={fieldKey} className="hover:bg-zinc-900/50 transition-colors">
                            <td className="px-4 py-3">
                              <span className="text-sm text-zinc-100">{fieldLabel}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={config.visible}
                                onChange={(e) => {
                                  setFieldSettings(prev => ({
                                    ...prev,
                                    [fieldKey]: { ...prev[fieldKey as keyof FieldSettings], visible: e.target.checked }
                                  }));
                                }}
                                className="w-4 h-4 text-cyan-600 bg-zinc-800 border-zinc-700 rounded focus:ring-cyan-500 focus:ring-2 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={config.allowAI}
                                onChange={(e) => {
                                  setFieldSettings(prev => ({
                                    ...prev,
                                    [fieldKey]: { ...prev[fieldKey as keyof FieldSettings], allowAI: e.target.checked }
                                  }));
                                }}
                                className="w-4 h-4 text-cyan-600 bg-zinc-800 border-zinc-700 rounded focus:ring-cyan-500 focus:ring-2 cursor-pointer"
                                disabled={!config.visible}
                                title={!config.visible ? '字段未显示时无法启用AI补全' : ''}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={config.defaultValueType}
                                onChange={(e) => {
                                  setFieldSettings(prev => ({
                                    ...prev,
                                    [fieldKey]: { 
                                      ...prev[fieldKey as keyof FieldSettings], 
                                      defaultValueType: e.target.value as DefaultValueType,
                                      customValue: e.target.value === 'custom' ? prev[fieldKey as keyof FieldSettings].customValue : undefined
                                    }
                                  }));
                                }}
                                className={`${InputClass} w-full text-xs py-1.5`}
                                disabled={!config.visible}
                              >
                                <option value="empty">空缺</option>
                                <option value="inherit">继承</option>
                                <option value="custom">自定义值</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              {config.visible && config.defaultValueType === 'custom' ? (
                                isComboboxField ? (
                                  <select
                                    value={config.customValue || ''}
                                    onChange={(e) => {
                                      setFieldSettings(prev => ({
                                        ...prev,
                                        [fieldKey]: { 
                                          ...prev[fieldKey as keyof FieldSettings], 
                                          customValue: e.target.value
                                        }
                                      }));
                                    }}
                                    className={`${InputClass} w-full text-xs py-1.5`}
                                  >
                                    <option value="">请选择...</option>
                                    {fieldKey === 'size' && SHOT_SIZES.map(opt => (
                                      <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                                    ))}
                                    {fieldKey === 'perspective' && PERSPECTIVES.map(opt => (
                                      <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                                    ))}
                                    {fieldKey === 'movement' && MOVEMENTS.map(opt => (
                                      <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                                    ))}
                                    {fieldKey === 'equipment' && EQUIPMENT.map(opt => (
                                      <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                                    ))}
                                    {fieldKey === 'focalLength' && FOCAL_LENGTHS.map(opt => (
                                      <option key={opt.value} value={opt.value}>{getLabel(opt, langMode)}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    value={config.customValue || ''}
                                    onChange={(e) => {
                                      setFieldSettings(prev => ({
                                        ...prev,
                                        [fieldKey]: { 
                                          ...prev[fieldKey as keyof FieldSettings], 
                                          customValue: e.target.value
                                        }
                                      }));
                                    }}
                                    placeholder="输入自定义值..."
                                    className={`${InputClass} w-full text-xs py-1.5`}
                                  />
                                )
                              ) : (
                                <span className="text-xs text-zinc-600">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-zinc-800">
              <button
                onClick={() => setIsFieldSettingsOpen(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => setIsFieldSettingsOpen(false)}
                className="px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 要素配置弹窗 */}
      {activeScene && (
        <SceneElementsConfig
          isOpen={isElementsConfigOpen}
          onClose={() => setIsElementsConfigOpen(false)}
          elements={activeScene.elements || []}
          keywords={keywords}
          outline={activeScene.outline || ''}
          onSave={(elements) => {
            updateScene(activeScene.id, 'elements', elements);
          }}
          onOutlineChange={(outline) => {
            updateScene(activeScene.id, 'outline', outline);
          }}
        />
      )}
    </div>
  );
};

export default App;
