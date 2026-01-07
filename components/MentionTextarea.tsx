import React, { useRef, useEffect, useState, useCallback } from 'react';
import { pinyin } from 'pinyin-pro';
import { ProjectKeyword } from '../types';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  keywords: ProjectKeyword[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  rows?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPointerDown?: (e: React.PointerEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  onAddShot?: () => void; // Callback for CMD+Enter when cursor is on last line
  isAutocompleteEnabled?: boolean; // AI自动补全功能开关
  autoResize?: boolean; // Enable auto-resize functionality
  minHeight?: number; // Minimum height in pixels
  maxHeight?: number; // Maximum height in pixels
  onHeightChange?: (height: number) => void; // Callback when height changes
}

interface MatchResult {
  currentWord: string;
  start: number;
  end: number;
  matches: ProjectKeyword[];
  bestMatch?: ProjectKeyword;
  suffix?: string; // The part to complete (ghost text)
}

export const MentionTextarea: React.FC<MentionTextareaProps> = ({
  value,
  onChange,
  keywords,
  placeholder,
  className,
  style,
  rows = 1,
  onKeyDown,
  onPointerDown,
  onBlur,
  onAddShot,
  isAutocompleteEnabled = true,
  autoResize = false,
  minHeight = 40,
  maxHeight = 150,
  onHeightChange
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedRange, setHighlightedRange] = useState<{ start: number; end: number } | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Find current word at cursor position
  const findCurrentWord = useCallback((text: string, cursorPos: number): { word: string; start: number; end: number } | null => {
    if (!text || text.length === 0) return null;
    if (cursorPos < 0) cursorPos = 0;
    if (cursorPos > text.length) cursorPos = text.length;
    
    // If cursor is at the start, check if there's a word starting at position 0
    if (cursorPos === 0) {
      // Check if first character is part of a word
      if (text.length > 0 && text[0] !== ' ' && text[0] !== '\n' && text[0] !== '\t') {
        let end = 0;
        while (end < text.length && text[end] !== ' ' && text[end] !== '\n' && text[end] !== '\t') {
          end++;
        }
        const word = text.substring(0, end);
        if (word.length > 0) {
          return { word, start: 0, end };
        }
      }
      return null;
    }
    
    // Find word start (go backwards until space, newline, or start)
    let start = cursorPos - 1;
    while (start >= 0 && text[start] !== ' ' && text[start] !== '\n' && text[start] !== '\t' && text[start] !== '\r') {
      start--;
    }
    start++; // Move to first character of word
    
    // Find word end (go forwards until space, newline, or end)
    let end = cursorPos;
    while (end < text.length && text[end] !== ' ' && text[end] !== '\n' && text[end] !== '\t' && text[end] !== '\r') {
      end++;
    }
    
    const word = text.substring(start, end);
    if (word.length === 0) return null;
    
    return { word, start, end };
  }, []);

  // Convert Chinese to pinyin (without tone marks)
  const toPinyin = useCallback((text: string): string => {
    try {
      return pinyin(text, { toneType: 'none', type: 'all' }).toLowerCase().replace(/\s+/g, '');
    } catch (e) {
      return text.toLowerCase();
    }
  }, []);

  // Get first character pinyin
  const getFirstCharPinyin = useCallback((text: string): string => {
    if (!text || text.length === 0) return '';
    const firstChar = text[0];
    try {
      return pinyin(firstChar, { toneType: 'none' }).toLowerCase();
    } catch (e) {
      return firstChar.toLowerCase();
    }
  }, []);

  // Check if input matches keyword (supports Chinese, pinyin, and first character)
  const matchesKeyword = useCallback((input: string, keyword: string): boolean => {
    if (!input || input.length === 0 || !keyword || keyword.length === 0) return false;
    
    const trimmedInput = input.trim();
    if (trimmedInput.length === 0) return false;
    
    const lowerInput = trimmedInput.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    
    // 1. Direct match: keyword starts with input (case insensitive)
    // This handles both Chinese and English prefix matching
    // Example: "沈" matches "沈知夏", "Le" matches "Leah"
    if (lowerKeyword.startsWith(lowerInput) && lowerKeyword !== lowerInput) {
      return true;
    }
    
    // 2. First character match: input is first character of keyword
    // This allows matching by typing just the first Chinese character
    // Example: "沈" matches "沈知夏" (even if input is longer, we check first char)
    if (keyword.length > 0 && keyword[0] === trimmedInput[0]) {
      return true;
    }
    
    // 3. Pinyin match: input matches pinyin of keyword (must start with input)
    // This handles full pinyin matching (e.g., "shenzhixia" matches "沈知夏")
    const keywordPinyin = toPinyin(keyword);
    if (keywordPinyin && keywordPinyin.startsWith(lowerInput)) {
      return true;
    }
    
    // 4. First character pinyin match: input matches pinyin of first character
    // This allows matching by typing pinyin of the first character (e.g., "shen" matches "沈知夏")
    const firstCharPinyin = getFirstCharPinyin(keyword);
    if (firstCharPinyin && firstCharPinyin.startsWith(lowerInput)) {
      return true;
    }
    
    return false;
  }, [toPinyin, getFirstCharPinyin]);

  // Find matching keywords
  const findMatches = useCallback((word: string): MatchResult | null => {
    if (!word || word.length === 0 || keywords.length === 0) return null;
    
    const matches: ProjectKeyword[] = [];
    
    // Find keywords that match the current word
    for (const keyword of keywords) {
      if (matchesKeyword(word, keyword.name)) {
        matches.push(keyword);
      }
    }
    
    if (matches.length === 0) return null;
    
    // Sort by relevance:
    // 1. Exact prefix match (Chinese or English) first
    // 2. First character match second
    // 3. Pinyin match third
    // 4. Then by length (shorter first) and alphabetically
    matches.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const lowerWord = word.toLowerCase();
      
      // Exact prefix match gets highest priority
      const aPrefixMatch = aName.startsWith(lowerWord);
      const bPrefixMatch = bName.startsWith(lowerWord);
      if (aPrefixMatch && !bPrefixMatch) return -1;
      if (!aPrefixMatch && bPrefixMatch) return 1;
      
      // First character match gets second priority
      const aFirstChar = a.name[0]?.toLowerCase() === word[0]?.toLowerCase();
      const bFirstChar = b.name[0]?.toLowerCase() === word[0]?.toLowerCase();
      if (aFirstChar && !bFirstChar) return -1;
      if (!aFirstChar && bFirstChar) return 1;
      
      // Pinyin prefix match gets third priority
      const aPinyin = toPinyin(a.name);
      const bPinyin = toPinyin(b.name);
      const aPinyinMatch = aPinyin.startsWith(lowerWord);
      const bPinyinMatch = bPinyin.startsWith(lowerWord);
      if (aPinyinMatch && !bPinyinMatch) return -1;
      if (!aPinyinMatch && bPinyinMatch) return 1;
      
      // Then by length and alphabetically
      if (a.name.length !== b.name.length) {
        return a.name.length - b.name.length;
      }
      return a.name.localeCompare(b.name);
    });
    
    const bestMatch = matches[0];
    
    // Calculate suffix based on the best match
    // Try to find the best suffix by checking different match types
    let suffix = '';
    const lowerWord = word.toLowerCase();
    const lowerKeyword = bestMatch.name.toLowerCase();
    
    if (lowerKeyword.startsWith(lowerWord)) {
      // Direct prefix match
      suffix = bestMatch.name.substring(word.length);
    } else if (bestMatch.name[0] === word[0]) {
      // First character match
      suffix = bestMatch.name.substring(1);
    } else {
      // Pinyin match - show remaining characters
      const keywordPinyin = toPinyin(bestMatch.name);
      if (keywordPinyin.startsWith(lowerWord)) {
        // Estimate remaining characters (approximate)
        const remainingPinyin = keywordPinyin.substring(lowerWord.length);
        // Try to map back to characters (simplified approach)
        suffix = bestMatch.name.substring(Math.min(word.length, bestMatch.name.length));
      } else {
        // Fallback: show remaining characters
        suffix = bestMatch.name.substring(Math.min(word.length, bestMatch.name.length));
      }
    }
    
    return {
      currentWord: word,
      start: 0, // Will be set by caller
      end: 0, // Will be set by caller
      matches,
      bestMatch,
      suffix
    };
  }, [keywords, matchesKeyword, toPinyin]);

  // Find all keyword matches in the text for highlighting
  const findAllKeywordMatches = useCallback((text: string): Array<{ start: number; end: number; keyword: ProjectKeyword }> => {
    if (!text || text.length === 0 || keywords.length === 0) return [];
    
    const matches: Array<{ start: number; end: number; keyword: ProjectKeyword }> = [];
    
    // For each keyword, find all occurrences in the text
    for (const keyword of keywords) {
      const keywordName = keyword.name;
      const isChinese = /[\u4e00-\u9fa5]/.test(keywordName);
      
      if (isChinese) {
        // For Chinese keywords: find all occurrences (no word boundary check needed)
        let searchIndex = 0;
        while (true) {
          const index = text.indexOf(keywordName, searchIndex);
          if (index === -1) break;
          
          matches.push({
            start: index,
            end: index + keywordName.length,
            keyword
          });
          
          searchIndex = index + 1;
        }
      } else {
        // For English/other keywords: use case-insensitive search with word boundary check
        const lowerKeyword = keywordName.toLowerCase();
        const lowerText = text.toLowerCase();
        let searchIndex = 0;
        
        while (true) {
          const index = lowerText.indexOf(lowerKeyword, searchIndex);
          if (index === -1) break;
          
          // Check if it's a whole word match (not part of another word)
          const beforeChar = index > 0 ? text[index - 1] : ' ';
          const afterChar = index + keywordName.length < text.length ? text[index + keywordName.length] : ' ';
          const isWordBoundary = /[\s\n\t\r\p{P}]/u.test(beforeChar) && /[\s\n\t\r\p{P}]/u.test(afterChar);
          
          // Also allow if at start/end of text
          const isAtStart = index === 0;
          const isAtEnd = index + keywordName.length === text.length;
          
          if (isWordBoundary || isAtStart || isAtEnd) {
            matches.push({
              start: index,
              end: index + keywordName.length,
              keyword
            });
          }
          
          searchIndex = index + 1;
        }
      }
    }
    
    // Sort by start position
    matches.sort((a, b) => a.start - b.start);
    
    // Remove overlapping matches (keep the first one)
    const nonOverlapping: Array<{ start: number; end: number; keyword: ProjectKeyword }> = [];
    for (const match of matches) {
      const overlaps = nonOverlapping.some(existing => 
        (match.start >= existing.start && match.start < existing.end) ||
        (match.end > existing.start && match.end <= existing.end) ||
        (match.start <= existing.start && match.end >= existing.end)
      );
      
      if (!overlaps) {
        nonOverlapping.push(match);
      }
    }
    
    return nonOverlapping;
  }, [keywords]);

  // Check for matches with debounce
  // Triggers when user types at least 1 character and pauses briefly
  const checkMatches = useCallback((text: string, cursorPos: number) => {
    // If autocomplete is disabled, don't check for matches
    if (!isAutocompleteEnabled) {
      setMatchResult(null);
      setShowDropdown(false);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }
    
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Wait 300ms after user stops typing (reduced from 2 seconds for better responsiveness)
    debounceTimerRef.current = setTimeout(() => {
      // Re-check cursor position in case it changed
      if (textareaRef.current) {
        const actualText = textareaRef.current.value;
        const actualCursorPos = textareaRef.current.selectionStart || cursorPos;
        const wordInfo = findCurrentWord(actualText, actualCursorPos);
        
        // Only need at least 1 character in the current word to trigger matching
        if (!wordInfo || wordInfo.word.length < 1) {
          setMatchResult(null);
          setShowDropdown(false);
          return;
        }
        
        const matches = findMatches(wordInfo.word);
        if (!matches) {
          setMatchResult(null);
          setShowDropdown(false);
          return;
        }
        
        const result: MatchResult = {
          ...matches,
          start: wordInfo.start,
          end: wordInfo.end
        };
        
        setMatchResult(result);
        setSelectedIndex(0);
        
        // Show dropdown if multiple matches, otherwise just show ghost text
        setShowDropdown(result.matches.length > 1);
      }
    }, 300); // 300ms debounce for responsive triggering
  }, [findCurrentWord, findMatches, isAutocompleteEnabled]);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    if (!autoResize || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    // Reset height to auto to get accurate scrollHeight
    textarea.style.height = 'auto';
    
    // Get scroll height (includes padding)
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
    
    // Apply height and maxHeight
    textarea.style.height = `${newHeight}px`;
    textarea.style.maxHeight = `${maxHeight}px`;
    
    // Notify parent of height change
    if (onHeightChange) {
      onHeightChange(newHeight);
    }
  }, [autoResize, minHeight, maxHeight, onHeightChange]);

  // Handle text change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    onChange(newValue);
    
    // Auto-resize if enabled
    if (autoResize) {
      setTimeout(() => {
        adjustHeight();
      }, 0);
    }
    
    // Check matches immediately with current cursor position
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const actualCursorPos = textareaRef.current.selectionStart || cursorPos;
        checkMatches(newValue, actualCursorPos);
      }
    });
  }, [onChange, checkMatches, autoResize, adjustHeight]);

  // Auto-resize on mount and value change
  useEffect(() => {
    if (autoResize) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        adjustHeight();
      }, 0);
    }
  }, [value, autoResize, adjustHeight]);

  // Handle cursor position change
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const handleSelectionChange = () => {
      const cursorPos = textarea.selectionStart;
      checkMatches(value, cursorPos);
    };
    
    // Use mouseup and keyup to detect cursor position changes
    textarea.addEventListener('mouseup', handleSelectionChange);
    textarea.addEventListener('keyup', handleSelectionChange);
    textarea.addEventListener('click', handleSelectionChange);
    
    return () => {
      textarea.removeEventListener('mouseup', handleSelectionChange);
      textarea.removeEventListener('keyup', handleSelectionChange);
      textarea.removeEventListener('click', handleSelectionChange);
    };
  }, [value, checkMatches]);

  // Accept suggestion (complete the word)
  const acceptSuggestion = useCallback((keyword?: ProjectKeyword) => {
    if (!matchResult || !textareaRef.current) return;
    
    const keywordToUse = keyword || matchResult.bestMatch;
    if (!keywordToUse) return;
    
    const before = value.substring(0, matchResult.start);
    const after = value.substring(matchResult.end);
    const newValue = `${before}${keywordToUse.name} ${after}`;
    
    onChange(newValue);
    
    // Visual feedback: highlight the completed word briefly
    const completedStart = matchResult.start;
    const completedEnd = matchResult.start + keywordToUse.name.length;
    setHighlightedRange({ start: completedStart, end: completedEnd });
    setTimeout(() => {
      setHighlightedRange(null);
    }, 500); // Highlight for 500ms
    
    setMatchResult(null);
    setShowDropdown(false);
    
    // Set cursor position after inserted word
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = matchResult.start + keywordToUse.name.length + 1; // +1 for space
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    }, 0);
  }, [value, matchResult, onChange]);

  // Check if cursor is on the last line
  const isCursorOnLastLine = useCallback((): boolean => {
    if (!textareaRef.current) return false;
    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    
    // Get text after cursor
    const textAfterCursor = value.substring(cursorPos);
    
    // If there's no newline after cursor, we're on the last line
    return !textAfterCursor.includes('\n');
  }, [value]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle CMD+Enter / Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (isCursorOnLastLine() && onAddShot) {
        // Cursor is on last line, trigger add shot
        e.preventDefault();
        e.stopPropagation();
        onAddShot();
        return;
      }
      // Cursor is not on last line, allow normal newline behavior
      // Don't prevent default, let it create a newline
      return;
    }
    
    if (matchResult) {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        // Accept ghost text or first suggestion
        acceptSuggestion();
        return;
      }
      
      if (showDropdown) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % matchResult.matches.length);
          return;
        }
        
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + matchResult.matches.length) % matchResult.matches.length);
          return;
        }
        
        if (e.key === 'Enter') {
          e.preventDefault();
          if (matchResult.matches.length > 0) {
            acceptSuggestion(matchResult.matches[selectedIndex]);
          }
          return;
        }
      }
      
      if (e.key === 'Escape') {
        e.preventDefault();
        setMatchResult(null);
        setShowDropdown(false);
        return;
      }
    }
    
    onKeyDown?.(e);
  }, [matchResult, showDropdown, selectedIndex, acceptSuggestion, onKeyDown, isCursorOnLastLine, onAddShot]);

  // Handle click on suggestion
  const handleSuggestionClick = useCallback((keyword: ProjectKeyword) => {
    acceptSuggestion(keyword);
  }, [acceptSuggestion]);

  // Get position for dropdown popup
  const getPopupPosition = useCallback(() => {
    if (!textareaRef.current || !matchResult) return { top: 0, left: 0 };
    
    const textarea = textareaRef.current;
    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const lineHeight = parseInt(style.lineHeight) || 20;
    
    // Calculate cursor position
    const textBeforeCursor = value.substring(0, matchResult.end);
    const lines = textBeforeCursor.split('\n');
    const lineNumber = lines.length - 1;
    const column = lines[lines.length - 1].length;
    
    // Approximate position
    const top = rect.top + (lineNumber * lineHeight) + lineHeight + 4;
    const left = rect.left + (column * 8) + 4; // Approximate character width
    
    return { top, left };
  }, [value, matchResult]);

  // Render text with highlights and ghost text
  const renderTextWithHighlights = useCallback(() => {
    if (!value && !matchResult) return [];
    
    const parts: Array<{ text: string; isHighlight: boolean; isGhost: boolean; isKeyword: boolean }> = [];
    let lastIndex = 0;
    
    // Find all keyword matches in the text
    const keywordMatches = findAllKeywordMatches(value);
    
    // Combine all highlight ranges (completion feedback + keyword matches)
    const allHighlights: Array<{ start: number; end: number; isKeyword?: boolean }> = [];
    
    // Add temporary completion highlight
    if (highlightedRange) {
      allHighlights.push({ start: highlightedRange.start, end: highlightedRange.end, isKeyword: false });
    }
    
    // Add keyword highlights
    for (const match of keywordMatches) {
      // Skip if it overlaps with the current word being typed (matchResult)
      if (matchResult) {
        const overlapsWithCurrentWord = 
          (match.start >= matchResult.start && match.start < matchResult.end) ||
          (match.end > matchResult.start && match.end <= matchResult.end) ||
          (match.start <= matchResult.start && match.end >= matchResult.end);
        if (overlapsWithCurrentWord) continue;
      }
      
      allHighlights.push({ start: match.start, end: match.end, isKeyword: true });
    }
    
    // Sort highlights by start position
    allHighlights.sort((a, b) => a.start - b.start);
    
    // Remove overlapping highlights (keep keyword highlights over completion highlights)
    const nonOverlappingHighlights: Array<{ start: number; end: number; isKeyword: boolean }> = [];
    for (const highlight of allHighlights) {
      const overlaps = nonOverlappingHighlights.some(existing => 
        (highlight.start >= existing.start && highlight.start < existing.end) ||
        (highlight.end > existing.start && highlight.end <= existing.end) ||
        (highlight.start <= existing.start && highlight.end >= existing.end)
      );
      
      if (!overlaps) {
        nonOverlappingHighlights.push(highlight);
      } else {
        // If keyword highlight overlaps with completion highlight, prefer keyword
        if (highlight.isKeyword) {
          const index = nonOverlappingHighlights.findIndex(existing => 
            (highlight.start >= existing.start && highlight.start < existing.end) ||
            (highlight.end > existing.start && highlight.end <= existing.end) ||
            (highlight.start <= existing.start && highlight.end >= existing.end)
          );
          if (index !== -1 && !nonOverlappingHighlights[index].isKeyword) {
            nonOverlappingHighlights[index] = highlight;
          }
        }
      }
    }
    
    // Re-sort after merging
    nonOverlappingHighlights.sort((a, b) => a.start - b.start);
    
    // Build parts array with highlights
    for (const highlight of nonOverlappingHighlights) {
      // Add text before highlight
      if (highlight.start > lastIndex) {
        parts.push({ 
          text: value.substring(lastIndex, highlight.start), 
          isHighlight: false, 
          isGhost: false,
          isKeyword: false
        });
      }
      
      // Add highlighted text
      parts.push({ 
        text: value.substring(highlight.start, highlight.end), 
        isHighlight: true, 
        isGhost: false,
        isKeyword: highlight.isKeyword
      });
      
      lastIndex = highlight.end;
    }
    
    // Add text up to match position (if there's a current match being typed)
    if (matchResult && matchResult.start > lastIndex) {
      parts.push({ 
        text: value.substring(lastIndex, matchResult.start), 
        isHighlight: false, 
        isGhost: false,
        isKeyword: false
      });
      lastIndex = matchResult.start;
    }
    
    // Add current word (the part user typed)
    if (matchResult && matchResult.end > lastIndex) {
      parts.push({ 
        text: value.substring(lastIndex, matchResult.end), 
        isHighlight: false, 
        isGhost: false,
        isKeyword: false
      });
      lastIndex = matchResult.end;
    }
    
    // Add remaining text after current word
    if (lastIndex < value.length) {
      parts.push({ 
        text: value.substring(lastIndex), 
        isHighlight: false, 
        isGhost: false,
        isKeyword: false
      });
    }
    
    // Add ghost text (suffix) right after current word if single match
    if (matchResult && !showDropdown && matchResult.suffix) {
      parts.push({ 
        text: matchResult.suffix, 
        isHighlight: false, 
        isGhost: true,
        isKeyword: false
      });
    }
    
    return parts;
  }, [value, highlightedRange, matchResult, showDropdown, findAllKeywordMatches]);

  const textParts = renderTextWithHighlights();
  const popupPosition = getPopupPosition();
  
  // Get computed styles from textarea to match exactly for cursor alignment
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({});
  
  useEffect(() => {
    if (textareaRef.current && textParts.length > 0) {
      const computed = window.getComputedStyle(textareaRef.current);
      setOverlayStyle({
        paddingTop: computed.paddingTop,
        paddingRight: computed.paddingRight,
        paddingBottom: computed.paddingBottom,
        paddingLeft: computed.paddingLeft,
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        letterSpacing: computed.letterSpacing,
        wordSpacing: computed.wordSpacing,
        textIndent: computed.textIndent,
        whiteSpace: computed.whiteSpace,
        overflowWrap: computed.overflowWrap,
        boxSizing: computed.boxSizing,
      });
    }
  }, [value, textParts.length]);

  return (
    <div className="relative">
      {/* Highlight overlay - shows highlights and ghost text */}
      {textParts.length > 0 && (
        <div
          className="absolute inset-0 pointer-events-none z-10 whitespace-pre-wrap break-words overflow-hidden"
          style={{
            ...overlayStyle,
            color: 'transparent',
            border: 'none',
            background: 'transparent',
            minHeight: style?.minHeight,
            maxHeight: style?.maxHeight,
            height: style?.height === 'auto' ? '100%' : style?.height,
            overflowY: 'hidden',
          }}
        >
            {textParts.map((part, index) => (
            <span
              key={index}
              style={{
                fontSize: overlayStyle.fontSize || '0.75rem',
                lineHeight: overlayStyle.lineHeight || '1.25',
              }}
              className={
                part.isHighlight 
                  ? part.isKeyword
                    ? 'text-cyan-400 font-medium' // Keyword highlight: brighter cyan
                    : 'text-cyan-300 font-medium' // Completion feedback: lighter cyan
                  : part.isGhost 
                    ? 'text-zinc-500' 
                    : 'text-zinc-100'
              }
            >
              {part.text}
            </span>
          ))}
        </div>
      )}
      
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPointerDown={onPointerDown}
        onBlur={onBlur}
        placeholder={placeholder}
        className={className}
        style={{
          ...style,
          color: textParts.length > 0 ? 'transparent' : undefined,
          caretColor: '#67e8f9', // cyan-300 for visible caret
        }}
        rows={rows}
      />
      
      {/* Dropdown Menu (only when multiple matches) */}
      {showDropdown && matchResult && matchResult.matches.length > 1 && (
        <div
          className="absolute z-50 bg-zinc-800 border border-zinc-700 rounded shadow-xl py-1 min-w-[200px] max-w-[300px] max-h-[200px] overflow-y-auto"
          style={{
            top: `${popupPosition.top}px`,
            left: `${popupPosition.left}px`,
          }}
        >
          {matchResult.matches.map((keyword, index) => (
            <div
              key={`${keyword.name}-${index}`}
              onClick={() => handleSuggestionClick(keyword)}
              className={`px-3 py-2 cursor-pointer hover:bg-zinc-700 transition-colors ${
                index === selectedIndex ? 'bg-zinc-700' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-100 font-medium">{keyword.name}</span>
                <span className="text-xs text-zinc-500 ml-2">{keyword.category}</span>
              </div>
              {keyword.visual_traits && (
                <div className="text-xs text-zinc-400 mt-1 truncate">{keyword.visual_traits}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
