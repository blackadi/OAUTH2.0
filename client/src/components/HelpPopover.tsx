import { useRef, useEffect, useState, type ReactNode } from 'react';

interface HelpPopoverProps {
  title: string;
  description: string;
  params?: { name: string; desc: string }[];
  returns?: string;
  tips?: string;
  children?: ReactNode;
}

const HelpPopover: React.FC<HelpPopoverProps> = ({ title, description, params, returns, tips, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="help-popover-container" ref={ref}>
      <button className="help-btn" onClick={() => setOpen(!open)} title="Help" aria-label="Help">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <text x="8" y="11.5" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">i</text>
        </svg>
      </button>
      {open && (
        <div className="help-popover">
          <div className="help-popover-header">
            <strong>{title}</strong>
            <button className="help-popover-close" onClick={() => setOpen(false)}>&times;</button>
          </div>
          <div className="help-popover-body">
            <p className="help-popover-desc">{description}</p>
            {params && params.length > 0 && (
              <div className="help-popover-section">
                <strong>Parameters</strong>
                <div className="help-popover-params">
                  {params.map((p, i) => (
                    <div key={i} className="help-popover-param">
                      <code>{p.name}</code>
                      <span>{p.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {returns && (
              <div className="help-popover-section">
                <strong>Returns</strong>
                <p>{returns}</p>
              </div>
            )}
            {tips && (
              <div className="help-popover-section help-popover-tips">
                <strong>Tips</strong>
                <p>{tips}</p>
              </div>
            )}
          </div>
          {children && <div className="help-popover-footer">{children}</div>}
        </div>
      )}
    </div>
  );
};

export default HelpPopover;
