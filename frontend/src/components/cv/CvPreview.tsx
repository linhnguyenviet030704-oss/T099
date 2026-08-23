import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { CvHeader, CvLine } from '../../lib/cv';
import { CvTemplateId } from '../../lib/cvTemplates';
import { CvDocument } from './CvDocument';

const A4_WIDTH_PX = 794; // 210mm at 96dpi

interface CvPreviewProps {
  header: CvHeader;
  lines: CvLine[];
  templateId: CvTemplateId;
  accent?: string;
}

/**
 * Auto-scaling wrapper around the A4 CvDocument. Measures its container width
 * and scales the fixed-size document to fit, so the preview always fills the
 * (resizable) preview pane without horizontal overflow. The forwarded ref
 * points at the unscaled CvDocument node for accurate WYSIWYG PDF capture.
 */
export const CvPreview = forwardRef<HTMLDivElement, CvPreviewProps>(
  ({ header, lines, templateId, accent }, ref) => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.5);
    const [docHeight, setDocHeight] = useState(0);

    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;

      const recompute = () => {
        const available = wrap.clientWidth || 320;
        const next = Math.min(1, Math.max(0.15, available / A4_WIDTH_PX));
        setScale(next);
        if (innerRef.current) {
          setDocHeight(innerRef.current.offsetHeight * next);
        }
      };

      recompute();
      const ro = new ResizeObserver(recompute);
      ro.observe(wrap);
      if (innerRef.current) ro.observe(innerRef.current);
      return () => ro.disconnect();
    }, [header, lines, templateId, accent]);

    return (
      <div ref={wrapRef} className="w-full overflow-hidden flex justify-center">
        {/* Spacer reserves the scaled height so the card grows correctly */}
        <div style={{ height: docHeight ? `${docHeight}px` : undefined, width: `${A4_WIDTH_PX * scale}px` }}>
          <div
            ref={innerRef}
            style={{
              width: `${A4_WIDTH_PX}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <div style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>
              <CvDocument
                ref={ref}
                header={header}
                lines={lines}
                templateId={templateId}
                accent={accent}
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

CvPreview.displayName = 'CvPreview';

export default CvPreview;
