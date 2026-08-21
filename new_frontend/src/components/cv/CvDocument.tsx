import React, { forwardRef } from 'react';
import { CvHeader, CvLine } from '../../lib/cv';
import { CvTemplateId, CV_TEMPLATES } from '../../lib/cvTemplates';
import { CvTemplateRenderer } from './templates';

interface CvDocumentProps {
  header: CvHeader;
  lines: CvLine[];
  templateId: CvTemplateId;
  /** optional accent override; defaults to the template's accent */
  accent?: string;
}

/**
 * The printable CV surface (A4). This exact node is rasterized by the WYSIWYG
 * PDF exporter. Rendering is delegated to the chosen template.
 */
export const CvDocument = forwardRef<HTMLDivElement, CvDocumentProps>(
  ({ header, lines, templateId, accent }, ref) => {
    const meta = CV_TEMPLATES.find((t) => t.id === templateId);
    const resolvedAccent = accent || meta?.accent || '#10b981';
    return (
      <div ref={ref}>
        <CvTemplateRenderer
          templateId={templateId}
          header={header}
          lines={lines}
          accent={resolvedAccent}
        />
      </div>
    );
  },
);

CvDocument.displayName = 'CvDocument';

export default CvDocument;
