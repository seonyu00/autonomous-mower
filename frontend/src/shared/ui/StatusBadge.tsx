type StatusBadgeProps = {
  label: string;
  tone?: 'connected' | 'degraded' | 'offline';
};

export function StatusBadge({ label, tone = 'connected' }: StatusBadgeProps) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}
