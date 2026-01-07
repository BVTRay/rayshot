import React from 'react';

export const RayShotLogo: React.FC<{ size?: number; className?: string }> = ({ 
  size = 16, 
  className = '' 
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 取景框主体 */}
      <rect
        x="4"
        y="6"
        width="16"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      
      {/* 取景框内部十字线 */}
      <line
        x1="12"
        y1="6"
        x2="12"
        y2="18"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.4"
      />
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.4"
      />
      
      {/* 左上角光线效果 */}
      <path
        d="M 4 6 L 8 2 L 12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* 右上角光线效果 */}
      <path
        d="M 20 6 L 16 2 L 12 6"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* 底部光线效果 */}
      <path
        d="M 4 18 L 8 22 L 12 18 M 20 18 L 16 22 L 12 18"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

