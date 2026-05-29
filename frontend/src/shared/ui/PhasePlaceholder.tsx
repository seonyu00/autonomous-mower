export function PhasePlaceholder({ title }: { title: string }) {
  return (
    <div className="phase-placeholder">
      <span className="placeholder-icon">--</span>
      <p>{title}</p>
    </div>
  );
}
