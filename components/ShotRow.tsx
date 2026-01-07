import React, { useRef, useEffect } from 'react';
import { Trash2, GripVertical, Plus } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Shot, LanguageMode } from '../types';
import { 
  SHOT_SIZES, 
  FOCAL_LENGTHS, 
  PERSPECTIVES, 
  MOVEMENTS, 
  EQUIPMENT
} from '../constants';
import { Combobox } from './Combobox';

interface ShotRowProps {
  shot: Shot;
  onChange: (id: string, field: keyof Shot, value: any) => void;
  onDelete: (id: string) => void;
  onInsert: (afterShotId: string) => void;
  langMode: LanguageMode;
  shouldAutoFocus?: boolean;
}

export const ShotRow: React.FC<ShotRowProps> = ({ 
  shot, 
  onChange, 
  onDelete, 
  onInsert,
  langMode,
  shouldAutoFocus 
}) => {
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

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
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const, 
    backgroundColor: isDragging ? '#27272a' : undefined, // Zinc-800 highlight
    boxShadow: isDragging ? '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : undefined,
  };

  // Compact styles
  const baseInputClass = "bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 w-full transition-colors leading-tight";

  useEffect(() => {
    if (shouldAutoFocus && descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, [shouldAutoFocus]);

  return (
    <tr 
      ref={setNodeRef} 
      style={style}
      className={`border-b border-zinc-800 transition-colors group ${isDragging ? 'bg-zinc-800' : 'hover:bg-zinc-900/40'}`}
    >
      {/* Drag Handle */}
      <td className="p-1 w-8 text-center align-middle">
        <button 
          className="text-zinc-600 hover:text-zinc-300 cursor-grab active:cursor-grabbing p-1 touch-none"
          {...attributes} 
          {...listeners}
          title="Drag to reorder"
          onPointerDown={(e) => {
             // Explicitly don't stop propagation here so dnd-kit hears it
          }}
        >
          <GripVertical size={14} />
        </button>
      </td>

      {/* Number */}
      <td className="p-1 text-center text-zinc-500 font-mono text-[10px] w-8 select-none">
        {shot.shotNumber}
      </td>
      
      {/* Description */}
      <td className="p-1 w-64">
        <textarea
          ref={descriptionRef}
          value={shot.description}
          onChange={(e) => onChange(shot.id, 'description', e.target.value)}
          placeholder="..."
          rows={1}
          className={`${baseInputClass} resize-none h-[26px] py-1`}
          style={{ minHeight: '26px' }}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()} 
        />
      </td>

      {/* ERT */}
      <td className="p-1 w-16">
        <input
          type="text"
          value={shot.ert}
          onChange={(e) => onChange(shot.id, 'ert', e.target.value)}
          className={`${baseInputClass} text-center`}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </td>

      {/* Comboboxes */}
      <td className="p-1 w-28">
        <div onPointerDown={(e) => e.stopPropagation()}>
          <Combobox
            value={shot.size}
            options={SHOT_SIZES}
            onChange={(val) => onChange(shot.id, 'size', val)}
            langMode={langMode}
          />
        </div>
      </td>

      <td className="p-1 w-28">
         <div onPointerDown={(e) => e.stopPropagation()}>
           <Combobox
            value={shot.perspective}
            options={PERSPECTIVES}
            onChange={(val) => onChange(shot.id, 'perspective', val)}
            langMode={langMode}
          />
         </div>
      </td>

      <td className="p-1 w-28">
         <div onPointerDown={(e) => e.stopPropagation()}>
           <Combobox
            value={shot.movement}
            options={MOVEMENTS}
            onChange={(val) => onChange(shot.id, 'movement', val)}
            langMode={langMode}
          />
         </div>
      </td>

       <td className="p-1 w-24">
         <div onPointerDown={(e) => e.stopPropagation()}>
           <Combobox
            value={shot.equipment}
            options={EQUIPMENT}
            onChange={(val) => onChange(shot.id, 'equipment', val)}
            langMode={langMode}
          />
         </div>
      </td>

      <td className="p-1 w-32">
         <div onPointerDown={(e) => e.stopPropagation()}>
           <Combobox
            value={shot.focalLength}
            options={FOCAL_LENGTHS}
            onChange={(val) => onChange(shot.id, 'focalLength', val)}
            langMode={langMode}
          />
         </div>
      </td>

      {/* Aspect Ratio */}
      <td className="p-1 w-16">
        <input 
          type="text"
          value={shot.aspectRatio}
          onChange={(e) => onChange(shot.id, 'aspectRatio', e.target.value)}
          className={`${baseInputClass} text-center font-mono text-[10px] text-zinc-400`}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </td>

      {/* Notes */}
      <td className="p-1 w-40">
        <input
          type="text"
          value={shot.notes}
          onChange={(e) => onChange(shot.id, 'notes', e.target.value)}
          className={baseInputClass}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </td>

      {/* Actions: Insert & Delete */}
      <td className="p-1 w-16 text-center">
        <div 
          className="flex items-center justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onInsert(shot.id)}
            className="text-zinc-600 hover:text-cyan-400 transition-colors p-1 rounded hover:bg-zinc-800"
            title="Insert Shot Below"
            tabIndex={-1}
          >
            <Plus size={14} />
          </button>
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
    </tr>
  );
};
