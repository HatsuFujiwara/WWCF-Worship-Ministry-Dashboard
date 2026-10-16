import React, { useState, useRef, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

export interface CustomSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  isWarning?: boolean;
  warningBadge?: string;
  accessibleLabel?: string;
}

export interface CustomSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: CustomSelectOption<T>[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'data-tour'?: string;
  size?: 'sm' | 'md';
}

export function CustomSelect<T extends string = string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  id,
  'aria-label': ariaLabel,
  'data-tour': dataTour,
  size = 'md'
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const autoId = useId();
  const selectId = id || `custom-select-${autoId}`;
  const listboxId = `listbox-${selectId}`;

  const selectedOption = options.find((opt) => opt.value === value);
  const isSelectedWarning = Boolean(selectedOption?.isWarning);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen]);

  // Sync highlightedIndex when opened
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, value, options]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement | HTMLUListElement>) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => (prev + 1) % options.length);
        }
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0 && highlightedIndex < options.length) {
          const opt = options[highlightedIndex];
          onChange(opt.value);
          triggerHaptic('selection');
          setIsOpen(false);
          buttonRef.current?.focus();
        } else {
          setIsOpen((prev) => !prev);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      }
      case 'Tab': {
        if (isOpen) {
          setIsOpen(false);
        }
        break;
      }
    }
  };

  const handleSelectOption = (opt: CustomSelectOption<T>) => {
    onChange(opt.value);
    triggerHaptic('selection');
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const isSmall = size === 'sm';

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left w-full ${className}`}
      data-custom-select="true"
    >
      {label && (
        <label
          htmlFor={selectId}
          className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1"
        >
          {label}
        </label>
      )}

      <button
        ref={buttonRef}
        id={selectId}
        type="button"
        data-tour={dataTour}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={
          selectedOption?.accessibleLabel ||
          ariaLabel ||
          label ||
          (selectedOption ? selectedOption.label : placeholder)
        }
        onClick={() => {
          if (!disabled) {
            triggerHaptic('tap');
            setIsOpen((prev) => !prev);
          }
        }}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border text-left font-medium transition-all duration-150 cursor-pointer select-none outline-none btn-press-feedback ${
          isSmall ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2.5 text-sm'
        } ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-75'
            : isSelectedWarning
            ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/90 dark:bg-rose-950/40 text-rose-950 dark:text-rose-100 ring-1 ring-rose-500/20'
            : isOpen
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {isSelectedWarning && (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
          )}
          {selectedOption?.icon && !isSelectedWarning && (
            <span className="shrink-0">{selectedOption.icon}</span>
          )}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {isSelectedWarning && selectedOption?.warningBadge && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
              {selectedOption.warningBadge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ease-out ${
            isSelectedWarning
              ? 'text-rose-400 dark:text-rose-500'
              : 'text-slate-400 dark:text-slate-500'
          } ${isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''}`}
          aria-hidden="true"
        />
      </button>

      {/* Animated Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            initial={{ opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            aria-activedescendant={
              highlightedIndex >= 0 ? `${selectId}-option-${highlightedIndex}` : undefined
            }
            onKeyDown={handleKeyDown}
            className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-xl bg-white dark:bg-slate-900 py-1 text-xs sm:text-sm shadow-xl border border-slate-200 dark:border-slate-800 outline-none"
          >
            {options.map((option, idx) => {
              const isSelected = option.value === value;
              const isHighlighted = idx === highlightedIndex;

              return (
                <li
                  key={option.value}
                  id={`${selectId}-option-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={option.accessibleLabel || option.label}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => handleSelectOption(option)}
                  className={`relative flex items-center justify-between gap-2 px-3 py-2 cursor-pointer select-none transition-colors duration-100 ${
                    option.isWarning
                      ? isSelected
                        ? 'bg-rose-100/90 dark:bg-rose-950/70 text-rose-950 dark:text-rose-100 font-semibold'
                        : isHighlighted
                        ? 'bg-rose-100/60 dark:bg-rose-950/50 text-rose-950 dark:text-rose-100'
                        : 'bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200'
                      : isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-200 font-semibold'
                      : isHighlighted
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    {option.isWarning ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden="true" />
                    ) : (
                      option.icon && <span className="shrink-0">{option.icon}</span>
                    )}
                    <div className="truncate min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={option.isWarning ? 'font-bold text-rose-900 dark:text-rose-200' : ''}>
                          {option.label}
                        </span>
                        {option.warningBadge && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            {option.warningBadge}
                          </span>
                        )}
                      </div>
                      {option.description && (
                        <p className={`text-[10px] truncate ${option.isWarning ? 'text-rose-700/90 dark:text-rose-300/90 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
                          {option.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <Check className={`w-3.5 h-3.5 shrink-0 ${option.isWarning ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'}`} />
                  )}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

