import React from 'react';
import { CvHeader, CvLine } from '../../lib/cv';
import {
  CvTemplateId,
  groupLines,
  sectionLabel,
  SIDEBAR_TYPES,
  SECTION_ORDER,
} from '../../lib/cvTemplates';
import { LineType } from '../../lib/profileLines';
import { formatDate } from '../../lib/format';

const A4: React.CSSProperties = {
  width: '210mm',
  minHeight: '297mm',
  boxSizing: 'border-box',
  fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  color: '#1f2937',
  background: '#ffffff',
};

const dateRange = (start: string, end: string): string => {
  if (!start && !end) return '';
  return `${start ? formatDate(start) : '...'} - ${end ? formatDate(end) : 'Hiện tại'}`;
};

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'CV';

interface TemplateProps {
  header: CvHeader;
  lines: CvLine[];
  accent: string;
}

/* ----------------------------- MODERN ----------------------------- */
const ModernTemplate: React.FC<TemplateProps> = ({ header, lines, accent }) => {
  const sections = groupLines(lines);
  return (
    <div style={{ ...A4, padding: '16mm 16mm' }}>
      <div style={{ borderBottom: `3px solid ${accent}`, paddingBottom: 14 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, color: '#111827', letterSpacing: -0.5 }}>
          {header.full_name || 'Họ và tên'}
        </h1>
        <div style={{ marginTop: 8, fontSize: 12, color: '#4b5563', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {header.email && <span>✉ {header.email}</span>}
          {header.phone && <span>☎ {header.phone}</span>}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        {sections.map((s) => (
          <div key={s.type} style={{ marginBottom: 18 }}>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 1.2,
                color: accent,
                margin: '0 0 8px',
              }}
            >
              {s.label}
            </h2>
            {s.lines.map((line) => (
              <Entry key={line.key} line={line} />
            ))}
          </div>
        ))}
        {sections.length === 0 && <EmptyNote />}
      </div>
    </div>
  );
};

const Entry: React.FC<{ line: CvLine; dense?: boolean }> = ({ line, dense }) => (
  <div style={{ marginBottom: dense ? 8 : 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
      <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: '#111827' }}>{line.title}</h3>
      {dateRange(line.start_date, line.end_date) && (
        <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>
          {dateRange(line.start_date, line.end_date)}
        </span>
      )}
    </div>
    {line.organization && (
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 1 }}>{line.organization}</div>
    )}
    {line.description && (
      <p style={{ fontSize: 11.5, color: '#4b5563', lineHeight: 1.5, margin: '4px 0 0', whiteSpace: 'pre-line' }}>
        {line.description}
      </p>
    )}
  </div>
);

const EmptyNote: React.FC = () => (
  <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 13 }}>
    Chưa có dòng nào được chọn để hiển thị trong CV.
  </p>
);

/* ----------------------------- SIDEBAR ----------------------------- */
const SidebarTemplate: React.FC<TemplateProps> = ({ header, lines, accent }) => {
  const sideTypes = SIDEBAR_TYPES;
  const mainTypes = SECTION_ORDER.filter((t) => !sideTypes.includes(t)) as LineType[];
  const sideSections = groupLines(lines, sideTypes);
  const mainSections = groupLines(lines, mainTypes);

  return (
    <div style={{ ...A4, display: 'flex', minHeight: '297mm' }}>
      {/* Sidebar */}
      <div style={{ width: '34%', background: accent, color: '#ffffff', padding: '18mm 10mm', boxSizing: 'border-box' }}>
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 30,
            fontWeight: 800,
            margin: '0 auto 16px',
          }}
        >
          {initials(header.full_name)}
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', margin: '0 0 18px', lineHeight: 1.2 }}>
          {header.full_name || 'Họ và tên'}
        </h1>

        <div style={{ marginBottom: 18 }}>
          <h2 style={sideHeading}>Liên hệ</h2>
          <div style={{ fontSize: 11, lineHeight: 1.7, wordBreak: 'break-word' }}>
            {header.email && <div>{header.email}</div>}
            {header.phone && <div>{header.phone}</div>}
          </div>
        </div>

        {sideSections.map((s) => (
          <div key={s.type} style={{ marginBottom: 16 }}>
            <h2 style={sideHeading}>{s.label}</h2>
            {s.lines.map((line) => (
              <div key={line.key} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700 }}>{line.title}</div>
                {line.organization && (
                  <div style={{ fontSize: 10, opacity: 0.85 }}>{line.organization}</div>
                )}
                {line.description && (
                  <div style={{ fontSize: 10, opacity: 0.85, lineHeight: 1.45, whiteSpace: 'pre-line' }}>
                    {line.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: '18mm 14mm', boxSizing: 'border-box' }}>
        {mainSections.map((s) => (
          <div key={s.type} style={{ marginBottom: 18 }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 1,
                color: accent,
                margin: '0 0 4px',
                paddingBottom: 4,
                borderBottom: '2px solid #e5e7eb',
              }}
            >
              {s.label}
            </h2>
            <div style={{ marginTop: 8 }}>
              {s.lines.map((line) => (
                <Entry key={line.key} line={line} />
              ))}
            </div>
          </div>
        ))}
        {mainSections.length === 0 && sideSections.length === 0 && <EmptyNote />}
      </div>
    </div>
  );
};

const sideHeading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  borderBottom: '1px solid rgba(255,255,255,0.3)',
  paddingBottom: 4,
  marginBottom: 8,
};

/* ----------------------------- CLASSIC ----------------------------- */
const ClassicTemplate: React.FC<TemplateProps> = ({ header, lines }) => {
  const sections = groupLines(lines);
  return (
    <div style={{ ...A4, padding: '18mm 20mm', fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div style={{ textAlign: 'center', borderBottom: '2px solid #1e293b', paddingBottom: 14 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: 1, color: '#1e293b' }}>
          {header.full_name || 'Họ và tên'}
        </h1>
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          {[header.email, header.phone].filter(Boolean).join('  |  ')}
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        {sections.map((s) => (
          <div key={s.type} style={{ marginBottom: 16 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 2,
                textAlign: 'center',
                color: '#1e293b',
                margin: '0 0 10px',
              }}
            >
              {s.label}
            </h2>
            {s.lines.map((line) => (
              <div key={line.key} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: '#111827' }}>{line.title}</h3>
                  {dateRange(line.start_date, line.end_date) && (
                    <span style={{ fontSize: 11, fontStyle: 'italic', color: '#64748b' }}>
                      {dateRange(line.start_date, line.end_date)}
                    </span>
                  )}
                </div>
                {line.organization && (
                  <div style={{ fontSize: 12, fontStyle: 'italic', color: '#475569', marginTop: 1 }}>
                    {line.organization}
                  </div>
                )}
                {line.description && (
                  <p style={{ fontSize: 11.5, color: '#374151', lineHeight: 1.55, margin: '4px 0 0', whiteSpace: 'pre-line' }}>
                    {line.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))}
        {sections.length === 0 && <EmptyNote />}
      </div>
    </div>
  );
};

/* ----------------------------- COMPACT ----------------------------- */
const CompactTemplate: React.FC<TemplateProps> = ({ header, lines, accent }) => {
  const sections = groupLines(lines);
  return (
    <div style={{ ...A4, padding: '14mm 14mm' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          background: '#f8fafc',
          borderLeft: `5px solid ${accent}`,
          padding: '12px 14px',
          borderRadius: 4,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#111827' }}>
          {header.full_name || 'Họ và tên'}
        </h1>
        <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'right', lineHeight: 1.5 }}>
          {header.email && <div>{header.email}</div>}
          {header.phone && <div>{header.phone}</div>}
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        {sections.map((s) => (
          <div key={s.type} style={{ marginBottom: 12 }}>
            <h2
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 1,
                color: accent,
                margin: '0 0 6px',
              }}
            >
              {s.label}
            </h2>
            {s.lines.map((line) => (
              <Entry key={line.key} line={line} dense />
            ))}
          </div>
        ))}
        {sections.length === 0 && <EmptyNote />}
      </div>
    </div>
  );
};

interface CvTemplateRendererProps {
  templateId: CvTemplateId;
  header: CvHeader;
  lines: CvLine[];
  accent: string;
}

/* ----------------------------- ELEGANT ----------------------------- */
const ElegantTemplate: React.FC<TemplateProps> = ({ header, lines, accent }) => {
  const sections = groupLines(lines);
  return (
    <div style={{ ...A4, padding: '20mm 18mm', fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 30, fontWeight: 400, margin: 0, letterSpacing: 3, color: '#1f2937' }}>
          {header.full_name || 'Họ và tên'}
        </h1>
        <div
          style={{
            width: 60,
            height: 2,
            background: accent,
            margin: '12px auto',
          }}
        />
        <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: 0.5 }}>
          {[header.email, header.phone].filter(Boolean).join('   ·   ')}
        </div>
      </div>
      <div style={{ marginTop: 22 }}>
        {sections.map((s) => (
          <div key={s.type} style={{ marginBottom: 18 }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 400,
                textTransform: 'uppercase',
                letterSpacing: 3,
                color: accent,
                margin: '0 0 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {s.label}
              <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </h2>
            {s.lines.map((line) => (
              <Entry key={line.key} line={line} />
            ))}
          </div>
        ))}
        {sections.length === 0 && <EmptyNote />}
      </div>
    </div>
  );
};

/* ----------------------------- MINIMAL ----------------------------- */
const MinimalTemplate: React.FC<TemplateProps> = ({ header, lines }) => {
  const sections = groupLines(lines);
  return (
    <div style={{ ...A4, padding: '18mm 18mm' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#111827' }}>
        {header.full_name || 'Họ và tên'}
      </h1>
      <div style={{ marginTop: 4, fontSize: 11, color: '#6b7280' }}>
        {[header.email, header.phone].filter(Boolean).join('  /  ')}
      </div>
      <div style={{ marginTop: 20 }}>
        {sections.map((s) => (
          <div key={s.type} style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
            <div style={{ width: 110, flexShrink: 0 }}>
              <h2
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: '#9ca3af',
                  margin: 0,
                }}
              >
                {s.label}
              </h2>
            </div>
            <div style={{ flex: 1 }}>
              {s.lines.map((line) => (
                <Entry key={line.key} line={line} dense />
              ))}
            </div>
          </div>
        ))}
        {sections.length === 0 && <EmptyNote />}
      </div>
    </div>
  );
};

/* --------------------------- PROFESSIONAL --------------------------- */
const ProfessionalTemplate: React.FC<TemplateProps> = ({ header, lines, accent }) => {
  const sections = groupLines(lines);
  return (
    <div style={{ ...A4 }}>
      {/* Banner header */}
      <div style={{ background: accent, color: '#fff', padding: '16mm 16mm 10mm' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
          {header.full_name || 'Họ và tên'}
        </h1>
        <div style={{ marginTop: 8, fontSize: 11.5, opacity: 0.95, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {header.email && <span>✉ {header.email}</span>}
          {header.phone && <span>☎ {header.phone}</span>}
        </div>
      </div>
      <div style={{ padding: '12mm 16mm' }}>
        {sections.map((s) => (
          <div key={s.type} style={{ marginBottom: 16 }}>
            <h2
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 1,
                color: '#111827',
                margin: '0 0 8px',
                borderLeft: `4px solid ${accent}`,
                paddingLeft: 8,
              }}
            >
              {s.label}
            </h2>
            {s.lines.map((line) => (
              <Entry key={line.key} line={line} />
            ))}
          </div>
        ))}
        {sections.length === 0 && <EmptyNote />}
      </div>
    </div>
  );
};

/* ----------------------------- CREATIVE ----------------------------- */
const CreativeTemplate: React.FC<TemplateProps> = ({ header, lines, accent }) => {
  const sections = groupLines(lines);
  return (
    <div style={{ ...A4, padding: '0' }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${accent}, #111827)`,
          color: '#fff',
          padding: '18mm 16mm',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <div
          style={{
            width: 70,
            height: 70,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initials(header.full_name)}
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>
            {header.full_name || 'Họ và tên'}
          </h1>
          <div style={{ marginTop: 6, fontSize: 11.5, opacity: 0.95 }}>
            {[header.email, header.phone].filter(Boolean).join('   ·   ')}
          </div>
        </div>
      </div>
      <div style={{ padding: '12mm 16mm' }}>
        {sections.map((s) => (
          <div key={s.type} style={{ marginBottom: 16 }}>
            <h2
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                color: accent,
                margin: '0 0 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: accent,
                }}
              />
              {s.label}
            </h2>
            {s.lines.map((line) => (
              <Entry key={line.key} line={line} />
            ))}
          </div>
        ))}
        {sections.length === 0 && <EmptyNote />}
      </div>
    </div>
  );
};

/* ----------------------------- TIMELINE ----------------------------- */
const TimelineTemplate: React.FC<TemplateProps> = ({ header, lines, accent }) => {
  const sections = groupLines(lines);
  return (
    <div style={{ ...A4, padding: '16mm 16mm' }}>
      <div style={{ borderBottom: `2px solid ${accent}`, paddingBottom: 12, marginBottom: 18 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: '#111827' }}>
          {header.full_name || 'Họ và tên'}
        </h1>
        <div style={{ marginTop: 6, fontSize: 11.5, color: '#6b7280' }}>
          {[header.email, header.phone].filter(Boolean).join('   ·   ')}
        </div>
      </div>
      {sections.map((s) => (
        <div key={s.type} style={{ marginBottom: 16 }}>
          <h2
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 1,
              color: accent,
              margin: '0 0 10px',
            }}
          >
            {s.label}
          </h2>
          <div style={{ borderLeft: `2px solid ${accent}33`, paddingLeft: 16, marginLeft: 4 }}>
            {s.lines.map((line) => (
              <div key={line.key} style={{ position: 'relative', marginBottom: 12 }}>
                <span
                  style={{
                    position: 'absolute',
                    left: -22,
                    top: 4,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: accent,
                    border: '2px solid #fff',
                    boxShadow: `0 0 0 1px ${accent}`,
                  }}
                />
                <Entry line={line} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {sections.length === 0 && <EmptyNote />}
    </div>
  );
};

/* ---------------------------- TWO COLUMN ---------------------------- */
const TwoColumnTemplate: React.FC<TemplateProps> = ({ header, lines, accent }) => {
  const leftTypes = SIDEBAR_TYPES;
  const rightTypes = SECTION_ORDER.filter((t) => !leftTypes.includes(t)) as LineType[];
  const leftSections = groupLines(lines, leftTypes);
  const rightSections = groupLines(lines, rightTypes);

  const colHeading: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: accent,
    margin: '0 0 8px',
    paddingBottom: 4,
    borderBottom: `2px solid ${accent}`,
  };

  return (
    <div style={{ ...A4, padding: '0' }}>
      {/* Full-width header */}
      <div
        style={{
          padding: '14mm 16mm',
          borderBottom: '1px solid #e5e7eb',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: '#111827' }}>
          {header.full_name || 'Họ và tên'}
        </h1>
        <div style={{ marginTop: 6, fontSize: 11.5, color: '#6b7280' }}>
          {[header.email, header.phone].filter(Boolean).join('   ·   ')}
        </div>
      </div>
      <div style={{ display: 'flex', padding: '12mm 16mm', gap: 22 }}>
        <div style={{ width: '38%' }}>
          {leftSections.map((s) => (
            <div key={s.type} style={{ marginBottom: 16 }}>
              <h2 style={colHeading}>{s.label}</h2>
              {s.lines.map((line) => (
                <Entry key={line.key} line={line} dense />
              ))}
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          {rightSections.map((s) => (
            <div key={s.type} style={{ marginBottom: 16 }}>
              <h2 style={colHeading}>{s.label}</h2>
              {s.lines.map((line) => (
                <Entry key={line.key} line={line} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {leftSections.length === 0 && rightSections.length === 0 && (
        <div style={{ padding: '0 16mm 12mm' }}>
          <EmptyNote />
        </div>
      )}
    </div>
  );
};

export const CvTemplateRenderer: React.FC<CvTemplateRendererProps> = ({
  templateId,
  header,
  lines,
  accent,
}) => {
  switch (templateId) {
    case 'sidebar':
      return <SidebarTemplate header={header} lines={lines} accent={accent} />;
    case 'classic':
      return <ClassicTemplate header={header} lines={lines} accent={accent} />;
    case 'compact':
      return <CompactTemplate header={header} lines={lines} accent={accent} />;
    case 'elegant':
      return <ElegantTemplate header={header} lines={lines} accent={accent} />;
    case 'minimal':
      return <MinimalTemplate header={header} lines={lines} accent={accent} />;
    case 'professional':
      return <ProfessionalTemplate header={header} lines={lines} accent={accent} />;
    case 'creative':
      return <CreativeTemplate header={header} lines={lines} accent={accent} />;
    case 'timeline':
      return <TimelineTemplate header={header} lines={lines} accent={accent} />;
    case 'twocolumn':
      return <TwoColumnTemplate header={header} lines={lines} accent={accent} />;
    case 'modern':
    default:
      return <ModernTemplate header={header} lines={lines} accent={accent} />;
  }
};

export default CvTemplateRenderer;
