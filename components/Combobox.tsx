import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { OptionItem, getLabel } from '../constants';
import { LanguageMode } from '../types';

interface ComboboxProps {
  value: string;
  options: OptionItem[];
  onChange: (value: string) => void;
  placeholder?: string;
  langMode: LanguageMode;
  className?: string;
  isExpanded?: boolean;
}

export const Combobox: React.FC<ComboboxProps> = ({
  value,
  options,
  onChange,
  placeholder,
  langMode,
  className,
  isExpanded = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Derive display text
  const selectedOption = options.find(o => o.value === value);
  const displayLabel = selectedOption ? getLabel(selectedOption, langMode) : value;

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    if (!query) return options;
    const lower = query.toLowerCase();
    return options.filter(opt => 
      opt.value.toLowerCase().includes(lower) || 
      opt.labelZh.toLowerCase().includes(lower)
    );
  }, [options, query]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery(''); // Reset query
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % filteredOptions.length);
        // Scroll into view logic could go here
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredOptions[activeIndex]) {
          handleSelect(filteredOptions[activeIndex].value);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
        break;
      case 'Tab':
        setIsOpen(false);
        // Allow default tab behavior
        break;
    }
  };

  const inputClass = isExpanded 
    ? "w-full h-full bg-transparent border-0 rounded px-1.5 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-0 transition-colors truncate text-center"
    : "w-full h-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors truncate";

  return (
    <div className={`relative ${className}`} ref={containerRef} style={{ height: className?.includes('h-full') ? '100%' : undefined }}>
      <div className="relative group h-full flex items-center justify-center">
        <input
          ref={inputRef}
          type="text"
          className={inputClass}
          value={isOpen ? query : displayLabel}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setActiveIndex(0); // Reset selection on type
          }}
          onFocus={() => {
            setQuery(''); // Clear query to allow fresh typing
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "-"}
          autoComplete="off"
        />
        {!isExpanded && (
          <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-hover:text-zinc-300" />
        )}
      </div>

      {isOpen && (
        <div 
          ref={listRef}
          className="absolute z-50 w-full min-w-[120px] mt-1 bg-zinc-800 border border-zinc-600 rounded shadow-xl max-h-64 overflow-y-auto left-0"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-zinc-500">No match</div>
          ) : (
            filteredOptions.map((opt, idx) => (
              <div
                key={opt.value}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur
                  handleSelect(opt.value);
                }}
                className={`
                  px-2 py-1.5 text-xs cursor-pointer flex items-center justify-between
                  ${idx === activeIndex ? 'bg-cyan-900/50 text-cyan-300' : 'text-zinc-300'}
                  hover:bg-cyan-900/30 hover:text-cyan-200
                `}
              >
                <span className="truncate">{getLabel(opt, langMode)}</span>
                {opt.value === value && <Check size={10} className="text-cyan-500 ml-2 flex-shrink-0" />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
