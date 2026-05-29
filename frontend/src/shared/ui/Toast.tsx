type ToastProps = {
  message: string;
  tone?: 'info' | 'warning' | 'critical';
};

export function Toast({ message, tone = 'info' }: ToastProps) {
  return (
    <div className={`toast ${tone}`} role="status">
      {message}
    </div>
  );
}
