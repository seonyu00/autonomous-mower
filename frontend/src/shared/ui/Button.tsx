import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  return <button className={`${variant === 'primary' ? 'primary-button' : 'secondary-button'} ${className}`} {...props} />;
}
