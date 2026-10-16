'use client'

import * as React from 'react'
import { useInView } from '@/hooks/use-in-view'
import { cn } from '@/lib/utils'

export interface ScrollRevealProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  delay?: number
  duration?: number
  direction?: 'up' | 'down' | 'left' | 'right' | 'none'
  replayOnScroll?: boolean
  triggerOnce?: boolean
  threshold?: number
}

const TRANSFORM_INICIAL = {
  up: 'translate-y-4 sm:translate-y-6',
  down: '-translate-y-4 sm:-translate-y-6',
  left: 'translate-x-4 sm:translate-x-6',
  right: '-translate-x-4 sm:-translate-x-6',
  none: '',
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  duration = 600,
  direction = 'up',
  replayOnScroll = true,
  triggerOnce = false,
  threshold = 0.15,
  style,
  ...props
}: ScrollRevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>({
    threshold,
    replayOnScroll,
    triggerOnce,
  })

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all will-change-[transform,opacity]',
        inView
          ? 'opacity-100 translate-x-0 translate-y-0 scale-100'
          : cn('opacity-0 scale-[0.99]', TRANSFORM_INICIAL[direction]),
        className,
      )}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
