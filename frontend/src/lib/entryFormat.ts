import React from 'react';

export interface ParsedEntryLine {
  raw: string;
  text: string;
  level: number; // 0 = root/header, 1 = single indent, 2 = double indent, 3 = triple indent, 4+ = deeper
  isBullet: boolean;
  isHeader: boolean;
}

/**
 * Parses raw multi-line entry text into a structured hierarchy supporting
 * single, double, and triple indentation levels.
 */
export function parseIndentedEntry(value: string): ParsedEntryLine[] {
  if (!value) return [];
  const rawLines = value.split(/\r?\n/);
  if (rawLines.length === 0) return [];

  // Filter out empty lines while keeping relative indices
  const nonEmpty = rawLines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  // Check if the entry starts with a header-like line (e.g. "Work skills:" or non-bullet text before bullets)
  const hasFirstNonBullet = !/^\s*[-*•+–—o◦▪]\s+/.test(nonEmpty[0]) && !/^\s*[-*•+–—]\s*/.test(nonEmpty[0]);
  const hasSubsequentBullets = nonEmpty.slice(1).some((l) => /^\s*[-*•+–—o◦▪]\s*/.test(l) || /^\s{2,}|\t/.test(l));
  const treatFirstAsHeader = hasFirstNonBullet && hasSubsequentBullets;

  return nonEmpty.map((line, idx) => {
    // 1. Measure leading whitespace
    const matchTabs = line.match(/^\t+/);
    const tabCount = matchTabs ? matchTabs[0].length : 0;
    const lineWithoutTabs = line.replace(/^\t+/, '');
    const matchSpaces = lineWithoutTabs.match(/^\s+/);
    const spaceCount = matchSpaces ? matchSpaces[0].length : 0;

    // Standard 2 spaces or 1 tab per level
    const whitespaceIndent = tabCount + Math.floor(spaceCount / 2);

    // 2. Check for bullet marker prefixes (-, *, •, +, --, ---, etc.)
    const trimmedLeft = line.trimStart();
    const multiDashMatch = trimmedLeft.match(/^(--+)\s+/);
    const standardBulletMatch = trimmedLeft.match(/^([*•+–—o◦▪]|-)\s+/);
    const digitBulletMatch = trimmedLeft.match(/^(\d+[\.\)])\s+/);

    let cleanText = trimmedLeft;
    let isBullet = false;
    let markerIndent = 0;

    if (multiDashMatch) {
      isBullet = true;
      markerIndent = multiDashMatch[1].length - 1; // "--" is level 2, "---" is level 3
      cleanText = trimmedLeft.replace(/^--+\s+/, '').trim();
    } else if (standardBulletMatch) {
      isBullet = true;
      cleanText = trimmedLeft.replace(/^([*•+–—o◦▪]|-)\s+/, '').trim();
    } else if (digitBulletMatch) {
      isBullet = true;
      cleanText = trimmedLeft; // Keep digit prefix like "1. ..."
    } else if (trimmedLeft.startsWith('- ') || trimmedLeft.startsWith('* ') || trimmedLeft.startsWith('• ')) {
      isBullet = true;
      cleanText = trimmedLeft.slice(2).trim();
    }

    // 3. Compute final level
    let level = 0;
    if (treatFirstAsHeader && idx === 0 && !isBullet) {
      level = 0;
    } else if (isBullet) {
      // Base bullet is at least level 1
      level = 1 + whitespaceIndent + markerIndent;
    } else if (whitespaceIndent > 0) {
      // Indented text without explicit bullet
      level = whitespaceIndent;
      isBullet = false;
    } else {
      level = 0;
    }

    const isHeader = (idx === 0 && treatFirstAsHeader) || (level === 0 && cleanText.endsWith(':'));

    return {
      raw: line,
      text: cleanText,
      level,
      isBullet,
      isHeader,
    };
  });
}

/**
 * Handle Tab and Shift+Tab key presses inside a textarea to indent/outdent
 * the current line or selection by 2 spaces.
 */
export function handleTextareaTabKey(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  onChange: (val: string) => void,
): void {
  if (e.key !== 'Tab') return;
  e.preventDefault();

  const textarea = e.currentTarget;
  const { selectionStart, selectionEnd, value } = textarea;

  const startLinePos = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const endLinePos = value.indexOf('\n', selectionEnd);
  const effectiveEnd = endLinePos === -1 ? value.length : endLinePos;

  const targetSection = value.slice(startLinePos, effectiveEnd);
  const lines = targetSection.split('\n');

  if (e.shiftKey) {
    // Outdent: remove up to 2 leading spaces or 1 tab from each line
    let removedCharsFirstLine = 0;
    let totalRemoved = 0;

    const newLines = lines.map((l, i) => {
      let removeCount = 0;
      if (l.startsWith('  ')) removeCount = 2;
      else if (l.startsWith(' ')) removeCount = 1;
      else if (l.startsWith('\t')) removeCount = 1;

      if (i === 0) removedCharsFirstLine = removeCount;
      totalRemoved += removeCount;
      return l.slice(removeCount);
    });

    const replaced = newLines.join('\n');
    const newValue = value.slice(0, startLinePos) + replaced + value.slice(effectiveEnd);
    onChange(newValue);

    requestAnimationFrame(() => {
      textarea.setSelectionRange(
        Math.max(startLinePos, selectionStart - removedCharsFirstLine),
        Math.max(startLinePos, selectionEnd - totalRemoved),
      );
    });
  } else {
    // Indent: add 2 spaces to the beginning of each line
    const newLines = lines.map((l) => '  ' + l);
    const replaced = newLines.join('\n');
    const newValue = value.slice(0, startLinePos) + replaced + value.slice(effectiveEnd);
    onChange(newValue);

    const addedPerLine = 2;
    const totalAdded = lines.length * addedPerLine;

    requestAnimationFrame(() => {
      textarea.setSelectionRange(
        selectionStart + addedPerLine,
        selectionEnd + totalAdded,
      );
    });
  }
}

/**
 * Adjust indentation of the currently selected line(s) in a textarea by delta (+1 indent or -1 outdent).
 */
export function applyIndentChange(
  textarea: HTMLTextAreaElement | null,
  delta: number,
  currentValue: string,
  onChange: (val: string) => void,
): void {
  if (!textarea) return;
  const { selectionStart, selectionEnd } = textarea;

  const startLinePos = currentValue.lastIndexOf('\n', selectionStart - 1) + 1;
  const endLinePos = currentValue.indexOf('\n', selectionEnd);
  const effectiveEnd = endLinePos === -1 ? currentValue.length : endLinePos;

  const targetSection = currentValue.slice(startLinePos, effectiveEnd);
  const lines = targetSection.split('\n');

  if (delta > 0) {
    const newLines = lines.map((l) => '  ' + l);
    const replaced = newLines.join('\n');
    const newValue = currentValue.slice(0, startLinePos) + replaced + currentValue.slice(effectiveEnd);
    onChange(newValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart + 2, selectionEnd + lines.length * 2);
    });
  } else {
    let removedCharsFirstLine = 0;
    let totalRemoved = 0;

    const newLines = lines.map((l, i) => {
      let removeCount = 0;
      if (l.startsWith('  ')) removeCount = 2;
      else if (l.startsWith(' ')) removeCount = 1;
      else if (l.startsWith('\t')) removeCount = 1;

      if (i === 0) removedCharsFirstLine = removeCount;
      totalRemoved += removeCount;
      return l.slice(removeCount);
    });

    const replaced = newLines.join('\n');
    const newValue = currentValue.slice(0, startLinePos) + replaced + currentValue.slice(effectiveEnd);
    onChange(newValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        Math.max(startLinePos, selectionStart - removedCharsFirstLine),
        Math.max(startLinePos, selectionEnd - totalRemoved),
      );
    });
  }
}

/**
 * Insert or convert current line to a bullet at a specified level (1, 2, or 3).
 * Level 1: "- text"
 * Level 2: "  - text" (double indent)
 * Level 3: "    - text" (triple indent)
 */
export function applyBulletLevel(
  textarea: HTMLTextAreaElement | null,
  level: 1 | 2 | 3,
  currentValue: string,
  onChange: (val: string) => void,
): void {
  if (!textarea) return;
  const { selectionStart, selectionEnd } = textarea;

  const startLinePos = currentValue.lastIndexOf('\n', selectionStart - 1) + 1;
  const endLinePos = currentValue.indexOf('\n', selectionEnd);
  const effectiveEnd = endLinePos === -1 ? currentValue.length : endLinePos;

  const targetSection = currentValue.slice(startLinePos, effectiveEnd);
  const lines = targetSection.split('\n');

  const prefix = level === 1 ? '- ' : level === 2 ? '  - ' : '    - ';

  const newLines = lines.map((l) => {
    // Strip existing leading bullets & spaces
    const clean = l.replace(/^[\s\t]*([-*•+–—]|\d+[\.\)])\s+/, '').replace(/^[\s\t]+/, '');
    return prefix + (clean || '');
  });

  const replaced = newLines.join('\n');
  const newValue = currentValue.slice(0, startLinePos) + replaced + currentValue.slice(effectiveEnd);
  onChange(newValue);

  requestAnimationFrame(() => {
    textarea.focus();
    const newCursor = startLinePos + prefix.length + (newLines[0].length - prefix.length);
    textarea.setSelectionRange(newCursor, newCursor);
  });
}
