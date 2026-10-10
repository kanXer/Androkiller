import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export default function BackToTop() {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;

      // Show after user scrolls down 280px
      if (scrollY > 280) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }

      // Compute scroll percentage (0 to 100)
      if (scrollHeight > 0) {
        const progress = Math.min(100, Math.max(0, (scrollY / scrollHeight) * 100));
        setScrollProgress(progress);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToTop = () => {
    try {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'smooth'
      });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  // SVG circular progress calculation (r = 18, circumference ≈ 113.1)
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scrollProgress / 100) * circumference;

  return (
    <div
      className={`fixed z-40 transition-all duration-300 ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-6 pointer-events-none'
      } bottom-20 right-4 sm:bottom-8 sm:right-8`}
    >
      <button
        onClick={handleScrollToTop}
        type="button"
        title="Scroll to top"
        aria-label="Back to top"
        className="group relative flex items-center justify-center w-12 h-12 rounded-full bg-slate-900/90 hover:bg-slate-800/95 text-cyan-400 hover:text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 shadow-xl shadow-slate-950/80 hover:shadow-cyan-500/25 backdrop-blur-xl transition-all duration-200 active:scale-95 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
      >
        {/* Circular SVG Scroll Progress Ring */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
          viewBox="0 0 44 44"
        >
          {/* Background Track */}
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="transparent"
            stroke="rgba(148, 163, 184, 0.15)"
            strokeWidth="2.5"
          />
          {/* Active Progress Ring */}
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="transparent"
            stroke="rgb(6, 182, 212)"
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-150"
          />
        </svg>

        {/* Arrow Up Icon with subtle upward nudge animation on hover */}
        <ArrowUp className="w-5 h-5 transition-transform duration-200 group-hover:-translate-y-1" />

        {/* Tooltip for desktop */}
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[10px] font-mono text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap shadow-lg hidden sm:block">
          TOP
        </span>
      </button>
    </div>
  );
}
