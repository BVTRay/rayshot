import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Trash2, GripVertical, Plus, Sparkles, Loader2, AlertCircle, RefreshCw, ZoomIn, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shot, LanguageMode } from '../types';
import { 
  SHOT_SIZES, 
  FOCAL_LENGTHS, 
  PERSPECTIVES, 
  MOVEMENTS, 
  EQUIPMENT,
  getUIText,
  UI_LABELS
} from '../constants';
import { Combobox } from './Combobox';
import { generateStoryboardSketch, suggestCameraSettings, CameraSuggestion } from '../services/geminiService';
import { MentionTextarea } from './MentionTextarea';
import { ProjectKeyword } from '../types';

interface ShotRowProps {
  shot: Shot;
  onChange: (id: string, field: keyof Shot, value: any) => void;
  onDelete: (id: string) => void;
  onInsert: (afterShotId: string) => void;
  onAddShot?: () => void; // Callback for adding new shot
  langMode: LanguageMode;
  shouldAutoFocus?: boolean;
  sceneLocation: string;
  sceneTime: string;
  isSketchExpanded: boolean;
  isAutocompleteEnabled?: boolean; // AI自动补全功能开关
  keywords?: ProjectKeyword[];
  previousShot?: { size?: string; movement?: string };
}

export const ShotRow: React.FC<ShotRowProps> = ({ 
  shot, 
  onChange, 
  onDelete, 
  onInsert,
  onAddShot,
  langMode,
  shouldAutoFocus,
  sceneLocation,
  sceneTime,
  isSketchExpanded,
  isAutocompleteEnabled = true,
  keywords = [],
  previousShot
}) => {
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showZoom, setShowZoom] = useState(false);
  const [descriptionHeight, setDescriptionHeight] = useState<number>(40); // Track description height
  
  // Smart Autofill states
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<CameraSuggestion | null>(null);
  const [userModifiedFields, setUserModifiedFields] = useState<Set<string>>(new Set());
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastDescriptionRef = useRef<string>('');
  
  const t = (key: keyof typeof UI_LABELS.en) => getUIText(key, langMode);

  // Smart Autofill: Request AI suggestion
  const requestAISuggestion = useCallback(async (description: string) => {
    if (!description || description.trim().length < 5) return;
    
    setIsSuggesting(true);
    try {
      const result = await suggestCameraSettings(description, sceneLocation, previousShot);
      if (result.suggestion) {
        setAiSuggestion(result.suggestion);
        
        // Apply suggestions only if user hasn't manually modified those fields
        const fieldsToUpdate: Array<{ field: keyof Shot; value: string }> = [];
        
        // Check current state to avoid overwriting user changes
        const currentUserModified = userModifiedFields;
        
        if (!currentUserModified.has('size') && !shot.size) {
          fieldsToUpdate.push({ field: 'size', value: result.suggestion.shot_size });
        }
        if (!currentUserModified.has('perspective') && !shot.perspective) {
          fieldsToUpdate.push({ field: 'perspective', value: result.suggestion.perspective });
        }
        if (!currentUserModified.has('movement') && !shot.movement) {
          fieldsToUpdate.push({ field: 'movement', value: result.suggestion.movement });
        }
        if (!currentUserModified.has('focalLength') && !shot.focalLength) {
          fieldsToUpdate.push({ field: 'focalLength', value: result.suggestion.focal_length });
        }
        
        // Apply updates and highlight
        fieldsToUpdate.forEach(({ field, value }) => {
          onChange(shot.id, field, value);
          setHighlightedFields(prev => new Set(prev).add(field));
          setTimeout(() => {
            setHighlightedFields(prev => {
              const next = new Set(prev);
              next.delete(field);
              return next;
            });
          }, 1000);
        });
      }
    } catch (error) {
      console.error('AI suggestion error:', error);
    } finally {
      setIsSuggesting(false);
    }
  }, [shot.id, sceneLocation, previousShot, userModifiedFields, shot.size, shot.perspective, shot.movement, shot.focalLength, onChange]);

  // Debounced suggestion trigger
  const triggerSuggestion = useCallback((description: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      if (description !== lastDescriptionRef.current) {
        lastDescriptionRef.current = description;
        requestAISuggestion(description);
      }
    }, 1000);
  }, [requestAISuggestion]);

  // Handle description change with debounce
  const handleDescriptionChange = useCallback((newValue: string) => {
    onChange(shot.id, 'description', newValue);
    triggerSuggestion(newValue);
  }, [shot.id, onChange, triggerSuggestion]);

  // Handle description blur
  const handleDescriptionBlur = useCallback(() => {
    if (shot.description && shot.description.trim().length >= 5) {
      requestAISuggestion(shot.description);
    }
  }, [shot.description, requestAISuggestion]);

  // Track user modifications
  const handleFieldChange = useCallback((field: keyof Shot, value: any) => {
    setUserModifiedFields(prev => new Set(prev).add(field));
    onChange(shot.id, field, value);
  }, [shot.id, onChange]);

  // DnD Hook
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: shot.id });
  
  // Fix: Use CSS.Translate instead of CSS.Transform to prevent table row squashing
  const style = {
    transform: CSS.Translate.toString(transform), 
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative' as const, 
    backgroundColor: isDragging ? '#27272a' : undefined, // Zinc-800 highlight
    boxShadow: isDragging ? '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : undefined,
    cursor: isDragging ? 'grabbing' : 'default',
  };

  // Compact styles - no border, only background
  const baseInputClass = "bg-zinc-900 border-0 rounded px-1.5 py-0.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-0 w-full transition-colors leading-tight";
  // Expanded styles - no border, no background, centered content
  const expandedInputClass = "bg-transparent border-0 rounded px-1.5 py-0.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-0 w-full transition-colors leading-tight text-center";
  const expandedTextareaClass = "bg-transparent border-0 rounded px-1.5 py-0.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-0 w-full transition-colors leading-tight text-center resize-none";

  useEffect(() => {
    if (shouldAutoFocus && descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, [shouldAutoFocus]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Initialize description height when component mounts or when expanded state changes
  useEffect(() => {
    if (!isSketchExpanded) {
      // Set initial height to minimum
      setDescriptionHeight(40);
    }
  }, [isSketchExpanded]);

  const handleGenerateSketch = async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const result = await generateStoryboardSketch(shot, sceneLocation, sceneTime);
      
      if (result.error) {
        setError(result.error);
      } else if (result.dataUrl) {
        onChange(shot.id, 'sketchImage', result.dataUrl);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate sketch');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleErrorClick = () => {
    if (error) {
      alert(error);
    }
  };

  // Calculate aspect ratio for image container
  const getAspectRatioStyle = () => {
    const ratio = shot.aspectRatio || '9:16';
    const [w, h] = ratio.split(':').map(Number);
    const percentage = (h / w) * 100;
    return { paddingBottom: `${percentage}%` };
  };

  // Calculate heights based on sketch expansion state
  const getSketchHeight = () => {
    if (!isSketchExpanded) return 0;
    const ratio = shot.aspectRatio || '9:16';
    const [w, h] = ratio.split(':').map(Number);
    // Visual column is w-32 (128px), with padding p-1 (4px each side = 8px total)
    // So actual width is 128 - 8 = 120px
    const width = 120;
    const height = (width * h) / w;
    return Math.max(height, 52); // Minimum height when expanded
  };

  const sketchHeight = getSketchHeight();
  // When collapsed, description height is auto (based on content)
  // When expanded, description height matches sketch height
  const expandedDescriptionHeight = isSketchExpanded && sketchHeight > 0 ? sketchHeight : 'auto';
  // Collapsed height should match "add next shot" button height (py-3 = 48px total)
  // Use actual description height when collapsed, otherwise use default
  const otherInputHeight = isSketchExpanded 
    ? 52 
    : (descriptionHeight || 40); // Use actual description height when collapsed

  return (
    <tr 
      ref={setNodeRef} 
      style={{
        ...style,
        minHeight: !isSketchExpanded ? '48px' : undefined,
        height: 'auto' // Allow row to grow with content
      }}
      className={`border-b border-zinc-800 transition-colors group ${isDragging ? 'bg-zinc-800 shadow-lg' : 'hover:bg-zinc-900/40'}`}
    >
      {/* Drag Handle */}
      <td className="p-1 w-8 text-center align-middle relative group/drag">
        <button 
          className="text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing p-1 touch-none select-none"
          {...attributes} 
          {...listeners}
          title="Drag to reorder"
          type="button"
          style={{ touchAction: 'none' }}
        >
          <GripVertical size={14} />
        </button>
        {/* Insert Button - appears at bottom edge (between rows) on hover */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <button
            onClick={() => onInsert(shot.id)}
            className="w-5 h-5 bg-zinc-800 hover:bg-cyan-600 border border-zinc-700 hover:border-cyan-500 rounded-full flex items-center justify-center text-zinc-400 hover:text-white transition-all hover:scale-110 shadow-lg pointer-events-auto"
            title="Insert shot here"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Plus size={10} />
          </button>
        </div>
      </td>

      {/* Number */}
      <td className="p-1 text-center text-zinc-500 font-mono text-[10px] w-8 select-none relative">
        {shot.shotNumber}
        {isSuggesting && (
          <div className="absolute top-0 right-0">
            <Loader2 size={10} className="animate-spin text-cyan-400" />
          </div>
        )}
      </td>
      
      {/* Description */}
      <td className={`p-1 w-64 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
        <MentionTextarea
          value={shot.description}
          onChange={handleDescriptionChange}
          onBlur={handleDescriptionBlur}
          onAddShot={onAddShot}
          keywords={keywords}
          isAutocompleteEnabled={isAutocompleteEnabled}
          placeholder="..."
          rows={1}
          autoResize={!isSketchExpanded}
          minHeight={40}
          maxHeight={150}
          onHeightChange={(height) => {
            if (!isSketchExpanded) {
              setDescriptionHeight(height);
            }
          }}
          className={isSketchExpanded ? expandedTextareaClass : `${baseInputClass} resize-none py-1 overflow-hidden`}
          style={{ 
            minHeight: isSketchExpanded && typeof expandedDescriptionHeight === 'number' 
              ? `${expandedDescriptionHeight}px` 
              : '40px',
            height: isSketchExpanded && typeof expandedDescriptionHeight === 'number'
              ? `${expandedDescriptionHeight}px`
              : 'auto',
            textAlign: isSketchExpanded ? 'center' : 'left',
            verticalAlign: isSketchExpanded ? 'middle' : 'top',
            display: 'block',
            width: '100%',
            overflowY: !isSketchExpanded ? 'auto' : 'hidden',
            fontSize: '0.75rem', // text-xs = 12px
            lineHeight: '1.25', // leading-tight
            boxSizing: 'border-box',
            resize: 'none'
          }}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </td>

      {/* ERT */}
      <td className={`p-1 w-20 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
        <div className="flex items-center justify-center gap-1">
          <input
            type="text"
            value={shot.ert || ''}
            onChange={(e) => {
              const value = e.target.value;
              // Only allow integers (including empty string)
              if (value === '' || /^\d+$/.test(value)) {
                onChange(shot.id, 'ert', value);
              }
            }}
            className={isSketchExpanded ? expandedInputClass : `${baseInputClass} text-center w-12`}
            style={{ 
              height: `${otherInputHeight}px`,
              lineHeight: `${otherInputHeight}px`
            }}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="0"
          />
          <span className="text-[10px] text-zinc-500">sec</span>
        </div>
      </td>

      {/* Comboboxes */}
      <td className={`p-1 w-28 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
        <div onPointerDown={(e) => e.stopPropagation()} style={{ height: `${otherInputHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Combobox
            value={shot.size}
            options={SHOT_SIZES}
            onChange={(val) => handleFieldChange('size', val)}
            langMode={langMode}
            className="h-full"
            isExpanded={isSketchExpanded}
            isHighlighted={highlightedFields.has('size')}
            suggestion={aiSuggestion && userModifiedFields.has('size') ? aiSuggestion.shot_size : undefined}
          />
        </div>
      </td>

      <td className={`p-1 w-28 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
         <div onPointerDown={(e) => e.stopPropagation()} style={{ height: `${otherInputHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <Combobox
            value={shot.perspective}
            options={PERSPECTIVES}
            onChange={(val) => handleFieldChange('perspective', val)}
            langMode={langMode}
            className="h-full"
            isExpanded={isSketchExpanded}
            isHighlighted={highlightedFields.has('perspective')}
            suggestion={aiSuggestion && userModifiedFields.has('perspective') ? aiSuggestion.perspective : undefined}
          />
         </div>
      </td>

      <td className={`p-1 w-28 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
         <div onPointerDown={(e) => e.stopPropagation()} style={{ height: `${otherInputHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <Combobox
            value={shot.movement}
            options={MOVEMENTS}
            onChange={(val) => handleFieldChange('movement', val)}
            langMode={langMode}
            className="h-full"
            isExpanded={isSketchExpanded}
            isHighlighted={highlightedFields.has('movement')}
            suggestion={aiSuggestion && userModifiedFields.has('movement') ? aiSuggestion.movement : undefined}
          />
         </div>
      </td>

       <td className={`p-1 w-24 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
         <div onPointerDown={(e) => e.stopPropagation()} style={{ height: `${otherInputHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <Combobox
            value={shot.equipment}
            options={EQUIPMENT}
            onChange={(val) => onChange(shot.id, 'equipment', val)}
            langMode={langMode}
            className="h-full"
            isExpanded={isSketchExpanded}
          />
         </div>
      </td>

      <td className={`p-1 w-32 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
         <div onPointerDown={(e) => e.stopPropagation()} style={{ height: `${otherInputHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <Combobox
            value={shot.focalLength}
            options={FOCAL_LENGTHS}
            onChange={(val) => handleFieldChange('focalLength', val)}
            langMode={langMode}
            className="h-full"
            isExpanded={isSketchExpanded}
            isHighlighted={highlightedFields.has('focalLength')}
            suggestion={aiSuggestion && userModifiedFields.has('focalLength') ? aiSuggestion.focal_length : undefined}
          />
         </div>
      </td>

      {/* Aspect Ratio */}
      <td className={`p-1 w-16 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
        <input 
          type="text"
          value={shot.aspectRatio}
          onChange={(e) => onChange(shot.id, 'aspectRatio', e.target.value)}
          className={isSketchExpanded ? `${expandedInputClass} font-mono text-[10px] text-zinc-400` : `${baseInputClass} text-center font-mono text-[10px] text-zinc-400`}
          style={{ 
            height: `${otherInputHeight}px`,
            lineHeight: `${otherInputHeight}px`
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </td>

      {/* Notes */}
      <td className={`p-1 w-40 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
        <input
          type="text"
          value={shot.notes}
          onChange={(e) => onChange(shot.id, 'notes', e.target.value)}
          className={isSketchExpanded ? expandedInputClass : baseInputClass}
          style={{ 
            height: `${otherInputHeight}px`,
            lineHeight: `${otherInputHeight}px`
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </td>

      {/* Visual: Sketch Generation */}
      <td className={`p-1 w-32 align-top ${!isSketchExpanded ? 'hidden' : ''}`}>
        <div 
          className="w-full relative"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Image Container */}
          <div 
            className="w-full relative bg-zinc-900 border border-zinc-700 rounded overflow-hidden group/image-wrapper"
            style={getAspectRatioStyle()}
          >
            {shot.sketchImage ? (
              <>
                <img
                  src={shot.sketchImage}
                  alt="Storyboard sketch"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 opacity-0 group-hover/image-wrapper:opacity-100 transition-opacity">
                  <button
                    onClick={() => setShowZoom(true)}
                    className="absolute top-1 right-1 w-6 h-6 bg-zinc-900/80 hover:bg-zinc-800 rounded flex items-center justify-center text-zinc-300 hover:text-white transition-all z-10"
                    title={t('zoom')}
                  >
                    <ZoomIn size={12} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-zinc-700">
                  <div className="text-zinc-600 text-[8px] text-center px-1">Sketch</div>
                </div>
                {/* Generate Button - Inside the dashed box */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <button
                    onClick={handleGenerateSketch}
                    disabled={isGenerating}
                    className={`
                      relative w-8 h-8 flex items-center justify-center rounded
                      transition-all bg-zinc-800/80 hover:bg-zinc-700/80 backdrop-blur-sm
                      ${isGenerating 
                        ? 'text-cyan-500 cursor-not-allowed' 
                        : error 
                          ? 'text-red-500 hover:text-red-400' 
                          : 'text-zinc-400 hover:text-cyan-400'
                      }
                    `}
                    title={isGenerating ? t('generating') : error ? error : t('generateSketch')}
                  >
                    {isGenerating ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : error ? (
                      <AlertCircle size={16} onClick={handleErrorClick} className="cursor-pointer" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                  </button>
                </div>
              </>
            )}
            {/* Regenerate button when image exists */}
            {shot.sketchImage && (
              <div className="absolute inset-0 opacity-0 group-hover/image-wrapper:opacity-100 transition-opacity">
                <button
                  onClick={handleGenerateSketch}
                  disabled={isGenerating}
                  className="absolute top-1 left-1 w-6 h-6 bg-zinc-900/80 hover:bg-zinc-800 rounded flex items-center justify-center text-zinc-300 hover:text-cyan-400 transition-all z-10"
                  title={isGenerating ? t('generating') : t('regenerate')}
                >
                  {isGenerating ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Actions: Delete */}
      <td className="p-1 w-16 text-center align-top">
        <div 
          className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ height: `${otherInputHeight}px` }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onDelete(shot.id)}
            className="text-zinc-600 hover:text-red-500 transition-colors p-1 rounded hover:bg-zinc-800"
            title="Delete Shot"
            tabIndex={-1}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </td>

      {/* Zoom Modal */}
      {showZoom && shot.sketchImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-8"
          onClick={() => setShowZoom(false)}
        >
          <div className="relative max-w-4xl max-h-full">
            <img
              src={shot.sketchImage}
              alt="Storyboard sketch - Full size"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setShowZoom(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-zinc-900/80 hover:bg-zinc-800 rounded flex items-center justify-center text-zinc-300 hover:text-white transition-all"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </tr>
  );
};
