import type { PropsWithChildren } from 'react';

type DialogProps = PropsWithChildren<{
  title: string;
  open: boolean;
  onClose: () => void;
}>;

export function Dialog({ title, open, onClose, children }: DialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="panel-heading compact">
          <h2 id="dialog-title">{title}</h2>
          <button className="secondary-button" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
