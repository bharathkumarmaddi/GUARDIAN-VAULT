import React from 'react';
import { GRAIN_SVG_DATA_URI } from '../constants/sections';

interface GrainOverlayProps {
  className?: string;
}

export const GrainOverlay: React.FC<GrainOverlayProps> = ({
  className = 'fixed inset-0 pointer-events-none z-50',
}) => {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        backgroundImage: GRAIN_SVG_DATA_URI,
        backgroundRepeat: 'repeat',
        backgroundSize: '200px 200px',
        opacity: 0.4,
      }}
    />
  );
};
