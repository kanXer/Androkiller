import React, { useState, useEffect, useRef } from 'react';
import { X, Minus, Square, Move, GripHorizontal, Maximize2 } from 'lucide-react';

export default function DraggableWindow({
  title,
  icon: Icon,
  badge,
  badgeColor = 'bg-cyan-950 text-cyan-300 border-cyan-800',
  isOpen,
  onClose,
  initialPosition = { x: 80, y: 120 },
  width = '520px',
  children
}) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const windowRef = useRef(null);

  // Detect mobile viewport and handle initial position
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      if (!mobile && isOpen) {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const defaultW = Math.min(520, screenW - 40);
        setPosition({
          x: Math.max(20, (screenW - defaultW) / 2),
          y: Math.max(60, (screenH - 500) / 3)
        });
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isOpen]);

  const handleMouseDown = (e) => {
    if (isMobile) return;
    if (e.target.closest('button')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleTouchStart = (e) => {
    if (isMobile) return;
    if (e.target.closest('button')) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragOffset({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
    });
  };

  useEffect(() => {
    if (isMobile) return;

    const handleMouseMove = (e) => {
      if (!isDragging || isMaximized) return;
      const newX = Math.max(10, Math.min(window.innerWidth - 120, e.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e) => {
      if (!isDragging || isMaximized) return;
      const touch = e.touches[0];
      const newX = Math.max(10, Math.min(window.innerWidth - 120, touch.clientX - dragOffset.x));
      const newY = Math.max(10, Math.min(window.innerHeight - 80, touch.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, dragOffset, isMaximized, isMobile]);

  if (!isOpen) return null;

  // On Mobile: Render as high-tech responsive bottom-sheet modal
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-md animate-fade-in">
        <div
          className="fixed inset-0"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          ref={windowRef}
          className="relative z-10 w-full max-h-[85vh] bg-slate-900/95 border-t border-cyan-500/40 rounded-t-3xl shadow-2xl backdrop-blur-2xl flex flex-col overflow-hidden"
        >
          {/* Pull Indicator Pill */}
          <div className="w-full pt-3 pb-1 flex justify-center">
            <div className="w-12 h-1.5 rounded-full bg-slate-700/80" />
          </div>

          {/* Title Header */}
          <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 truncate">
              {Icon && <Icon className="w-4 h-4 text-cyan-400 shrink-0" />}
              <span className="font-bold text-sm text-white truncate">{title}</span>
              {badge && (
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeColor}`}>
                  {badge}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800/80 active:bg-rose-900/40"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(85vh-70px)] select-text">
            {children}
          </div>
        </div>
      </div>
    );
  }

  // On Desktop: Render as free draggable window
  return (
    <div
      ref={windowRef}
      style={
        isMaximized
          ? { top: '16px', left: '16px', right: '16px', bottom: '16px', width: 'auto', height: 'auto' }
          : { top: `${position.y}px`, left: `${position.x}px`, width: `min(${width}, calc(100vw - 32px))` }
      }
      className={`fixed z-50 bg-slate-900/85 border border-cyan-500/40 rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-2xl ring-1 ring-white/10 flex flex-col overflow-hidden transition-all duration-75 select-none ${
        isDragging ? 'shadow-cyan-500/20 ring-2 ring-cyan-500/50 cursor-grabbing' : ''
      }`}
    >
      {/* Draggable Title Bar / Header */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className="px-4 py-3 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-slate-950/90 transition-colors"
      >
        <div className="flex items-center space-x-2.5 truncate">
          <GripHorizontal className="w-4 h-4 text-slate-500 shrink-0" />
          {Icon && <Icon className="w-4 h-4 text-cyan-400 shrink-0" />}
          <span className="font-bold text-xs sm:text-sm text-white truncate">{title}</span>
          {badge && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>

        {/* Window Controls */}
        <div className="flex items-center space-x-1.5 shrink-0 ml-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={isMinimized ? 'Expand Window' : 'Minimize Window'}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors hidden sm:block"
            title={isMaximized ? 'Restore Size' : 'Maximize Window'}
          >
            {isMaximized ? <Square className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 transition-colors"
            title="Close Window"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Window Body */}
      {!isMinimized && (
        <div className="p-4 sm:p-5 overflow-y-auto max-h-[75vh] select-text">
          {children}
        </div>
      )}
    </div>
  );
}
