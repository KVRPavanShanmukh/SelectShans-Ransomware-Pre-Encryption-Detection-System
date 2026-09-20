import React, { useState, useRef, useCallback } from 'react';

const DraggableLearnButton = () => {
  const [position, setPosition] = useState({ x: window.innerWidth - 200, y: window.innerHeight - 80 });
  const [isDragging, setIsDragging] = useState(false);
  
  const dragState = useRef({
    longPressTimer: null,
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    hasMoved: false
  });

  const handlePointerMove = useCallback((e) => {
    if (!dragState.current.isDragging) {
      const dx = Math.abs(e.clientX - dragState.current.startX);
      const dy = Math.abs(e.clientY - dragState.current.startY);
      if (dx > 5 || dy > 5) {
        clearTimeout(dragState.current.longPressTimer);
        dragState.current.hasMoved = true;
      }
      return;
    }

    // Update position if dragging
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    
    const newX = Math.max(0, Math.min(window.innerWidth - 180, dragState.current.initialX + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - 50, dragState.current.initialY + dy));

    setPosition({ x: newX, y: newY });
  }, []);

  const handlePointerUp = useCallback(() => {
    clearTimeout(dragState.current.longPressTimer);
    
    // Remove listeners
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);

    if (dragState.current.isDragging) {
      setIsDragging(false);
      dragState.current.isDragging = false;
    } else {
      if (!dragState.current.hasMoved) {
        window.open('/learning-hub', '_blank', 'noopener,noreferrer');
      }
    }
  }, [handlePointerMove]);

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    
    // Crucial for stopping text selection issues while dragging
    e.preventDefault();

    dragState.current.startX = e.clientX;
    dragState.current.startY = e.clientY;
    dragState.current.initialX = position.x;
    dragState.current.initialY = position.y;
    dragState.current.hasMoved = false;

    // Start long press timer
    dragState.current.longPressTimer = setTimeout(() => {
      setIsDragging(true);
      dragState.current.isDragging = true;
    }, 250); // 250ms

    // Add listeners to window so dragging works even outside the button bounds
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <button
      onPointerDown={handlePointerDown}
      title="Long press to drag"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        background: 'rgba(0,124,195,0.15)',
        border: isDragging ? '1px dashed #00ffcc' : '1px solid rgba(0,124,195,0.4)',
        color: isDragging ? '#00ffcc' : '#007CC3',
        padding: '10px 20px',
        borderRadius: 8,
        cursor: isDragging ? 'grabbing' : 'pointer',
        fontWeight: 600,
        zIndex: 9999,
        backdropFilter: 'blur(10px)',
        userSelect: 'none',
        touchAction: 'none',
        boxShadow: isDragging ? '0 0 15px rgba(0,255,204,0.3)' : 'none',
        transition: isDragging ? 'none' : 'box-shadow 0.2s, border 0.2s'
      }}
    >
      Learn Tech Stack
    </button>
  );
};

export default DraggableLearnButton;
