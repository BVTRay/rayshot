import React, { useRef, useEffect, useState } from 'react';
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
import { generateStoryboardSketch } from '../services/geminiService';

interface ShotRowProps {
  shot: Shot;
  onChange: (id: string, field: keyof Shot, value: any) => void;
  onDelete: (id: string) => void;
  onInsert: (afterShotId: string) => void;
  langMode: LanguageMode;
  shouldAutoFocus?: boolean;
  sceneLocation: string;
  sceneTime: string;
  isSketchExpanded: boolean;
}

export const ShotRow: React.FC<ShotRowProps> = ({ 
  shot, 
  onChange, 
  onDelete, 
  onInsert,
  langMode,
  shouldAutoFocus,
  sceneLocation,
  sceneTime,
  isSketchExpanded
}) => {
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showZoom, setShowZoom] = useState(false);
  
  const t = (key: keyof typeof UI_LABELS.en) => getUIText(key, langMode);

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

  // Compact styles
  const baseInputClass = "bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 w-full transition-colors leading-tight";
  // Expanded styles - no border, no background, centered content
  const expandedInputClass = "bg-transparent border-0 rounded px-1.5 py-0.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-0 w-full transition-colors leading-tight text-center";
  const expandedTextareaClass = "bg-transparent border-0 rounded px-1.5 py-0.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-0 w-full transition-colors leading-tight text-center resize-none";

  useEffect(() => {
    if (shouldAutoFocus && descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, [shouldAutoFocus]);

  // Auto-resize description textarea when collapsed
  useEffect(() => {
    if (!isSketchExpanded && descriptionRef.current) {
      descriptionRef.current.style.height = 'auto';
      descriptionRef.current.style.height = `${descriptionRef.current.scrollHeight}px`;
    }
  }, [shot.description, isSketchExpanded]);

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
  const descriptionHeight = isSketchExpanded && sketchHeight > 0 ? sketchHeight : 'auto';
  const otherInputHeight = isSketchExpanded ? 52 : 26; // 2x when expanded

  return (
    <tr 
      ref={setNodeRef} 
      style={style}
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
      <td className="p-1 text-center text-zinc-500 font-mono text-[10px] w-8 select-none">
        {shot.shotNumber}
      </td>
      
      {/* Description */}
      <td className={`p-1 w-64 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
        <textarea
          ref={descriptionRef}
          value={shot.description}
          onChange={(e) => {
            onChange(shot.id, 'description', e.target.value);
            // Auto-resize textarea
            if (!isSketchExpanded && e.target) {
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }
          }}
          placeholder="..."
          rows={1}
          className={isSketchExpanded ? expandedTextareaClass : `${baseInputClass} resize-none py-1 overflow-hidden`}
          style={{ 
            minHeight: isSketchExpanded && typeof descriptionHeight === 'number' 
              ? `${descriptionHeight}px` 
              : '26px',
            height: isSketchExpanded && typeof descriptionHeight === 'number'
              ? `${descriptionHeight}px`
              : 'auto',
            textAlign: isSketchExpanded ? 'center' : 'left',
            verticalAlign: isSketchExpanded ? 'middle' : 'top',
            display: 'block',
            width: '100%'
          }}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()} 
        />
      </td>

      {/* ERT */}
      <td className={`p-1 w-16 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
        <input
          type="text"
          value={shot.ert}
          onChange={(e) => onChange(shot.id, 'ert', e.target.value)}
          className={isSketchExpanded ? expandedInputClass : `${baseInputClass} text-center`}
          style={{ 
            height: `${otherInputHeight}px`,
            lineHeight: `${otherInputHeight}px`
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </td>

      {/* Comboboxes */}
      <td className={`p-1 w-28 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
        <div onPointerDown={(e) => e.stopPropagation()} style={{ height: `${otherInputHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Combobox
            value={shot.size}
            options={SHOT_SIZES}
            onChange={(val) => onChange(shot.id, 'size', val)}
            langMode={langMode}
            className="h-full"
            isExpanded={isSketchExpanded}
          />
        </div>
      </td>

      <td className={`p-1 w-28 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
         <div onPointerDown={(e) => e.stopPropagation()} style={{ height: `${otherInputHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <Combobox
            value={shot.perspective}
            options={PERSPECTIVES}
            onChange={(val) => onChange(shot.id, 'perspective', val)}
            langMode={langMode}
            className="h-full"
            isExpanded={isSketchExpanded}
          />
         </div>
      </td>

      <td className={`p-1 w-28 ${isSketchExpanded ? 'align-middle' : 'align-top'}`}>
         <div onPointerDown={(e) => e.stopPropagation()} style={{ height: `${otherInputHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <Combobox
            value={shot.movement}
            options={MOVEMENTS}
            onChange={(val) => onChange(shot.id, 'movement', val)}
            langMode={langMode}
            className="h-full"
            isExpanded={isSketchExpanded}
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
            onChange={(val) => onChange(shot.id, 'focalLength', val)}
            langMode={langMode}
            className="h-full"
            isExpanded={isSketchExpanded}
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
