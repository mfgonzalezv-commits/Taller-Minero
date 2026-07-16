import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface CatButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}

const styles = {
  primary: 'font-bold text-[var(--cat-black)] hover:opacity-90',
  secondary: 'border border-[#D0D0D0] bg-white text-[var(--cat-grey)] hover:bg-gray-50',
  ghost: 'text-[var(--cat-grey)] hover:bg-gray-100',
  danger: 'bg-red-600 text-white font-medium hover:bg-red-700',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
}

export function CatButton({
  variant = 'primary',
  size = 'md',
  className,
  style,
  ...props
}: CatButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50',
        styles[variant],
        sizes[size],
        className
      )}
      style={variant === 'primary' ? { backgroundColor: 'var(--cat-yellow)', ...style } : style}
    />
  )
}
