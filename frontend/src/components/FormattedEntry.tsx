import React from 'react';
import { parseIndentedEntry } from '../lib/entryFormat';

interface FormattedEntryProps {
  value: string;
  dense?: boolean;
  textColor?: string;
  bulletColor?: string;
  accentColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const FormattedEntry: React.FC<FormattedEntryProps> = ({
  value,
  dense = false,
  textColor,
  bulletColor,
  accentColor,
  className = '',
  style,
}) => {
  const parsed = parseIndentedEntry(value);

  if (!parsed || parsed.length === 0) {
    return null;
  }

  // Single plain line with no bullet or indent
  if (parsed.length === 1 && parsed[0].level === 0 && !parsed[0].isBullet) {
    return (
      <div
        data-entry-item="true"
        className={className}
        style={{
          fontSize: dense ? 11 : 12,
          color: textColor || '#374151',
          lineHeight: 1.5,
          marginBottom: dense ? 4 : 8,
          breakInside: 'avoid',
          pageBreakInside: 'avoid',
          ...style,
        }}
      >
        {parsed[0].text}
      </div>
    );
  }

  return (
    <div
      data-entry-item="true"
      className={className}
      style={{
        marginBottom: dense ? 5 : 8,
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
        ...style,
      }}
    >
      {parsed.map((item, idx) => {
        const { level, text, isBullet, isHeader } = item;

        // Level 0: Title or root line
        if (level === 0) {
          return (
            <div
              key={idx}
              style={{
                fontSize: dense ? 11 : 12,
                fontWeight: isHeader ? 700 : 400,
                color: isHeader && accentColor ? accentColor : textColor || '#1f2937',
                lineHeight: 1.5,
                marginTop: idx > 0 ? (dense ? 3 : 5) : 0,
                marginBottom: dense ? 2 : 3,
              }}
            >
              {text}
            </div>
          );
        }

        // Indented bullet lines
        // Bullet glyph based on indent level
        let bulletGlyph = '•';
        let bulletSize = dense ? 12 : 14;
        let indentPx = dense ? 12 : 16;

        if (level === 2) {
          bulletGlyph = '◦'; // Hollow circle for Level 2 (double indent)
          indentPx = dense ? 24 : 32;
        } else if (level === 3) {
          bulletGlyph = '▪'; // Small square for Level 3 (triple indent)
          bulletSize = dense ? 10 : 12;
          indentPx = dense ? 36 : 46;
        } else if (level >= 4) {
          bulletGlyph = '▫';
          bulletSize = dense ? 9 : 11;
          indentPx = dense ? 36 + (level - 3) * 12 : 46 + (level - 3) * 14;
        }

        return (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              paddingLeft: indentPx,
              marginTop: 1,
              marginBottom: dense ? 2 : 3,
              fontSize: dense ? (level > 2 ? 10 : 11) : (level > 2 ? 11 : 12),
              color: textColor || (level > 1 ? '#4b5563' : '#374151'),
              lineHeight: 1.45,
            }}
          >
            {isBullet ? (
              <span
                style={{
                  display: 'inline-block',
                  width: 14,
                  flexShrink: 0,
                  fontSize: bulletSize,
                  lineHeight: '1.2',
                  color: bulletColor || (level === 1 ? '#6b7280' : '#9ca3af'),
                  userSelect: 'none',
                }}
              >
                {bulletGlyph}
              </span>
            ) : (
              <span style={{ width: 6, flexShrink: 0 }} />
            )}
            <span style={{ flex: 1, wordBreak: 'break-word' }}>{text}</span>
          </div>
        );
      })}
    </div>
  );
};

export default FormattedEntry;
