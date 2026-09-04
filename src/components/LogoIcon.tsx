import React from 'react';

export function LogoIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 100 100" 
      className={className} 
      {...props}
    >
      {/* Golden Crown / Sunburst */}
      <path 
        d="M50 15 L55 35 L75 25 L62 42 L82 45 L65 52 L80 65 L60 60 L50 75 L40 60 L20 65 L35 52 L18 45 L38 42 L25 25 L45 35 Z" 
        fill="#FFD700" 
      />
      
      {/* Dark Smoke/Shadows wrapping the blade */}
      <path 
        d="M35 55 Q20 50, 25 65 T30 75 Q20 85, 40 85 Q35 70, 45 65 Z" 
        fill="#1e293b" 
        opacity="0.8"
      />
      <path 
        d="M65 55 Q80 50, 75 65 T70 75 Q80 85, 60 85 Q65 70, 55 65 Z" 
        fill="#1e293b" 
        opacity="0.8"
      />

      {/* Sword Blade */}
      <path 
        d="M46 45 L54 45 L50 90 Z" 
        fill="#0f172a" 
      />
      {/* Sword Crossguard */}
      <path 
        d="M38 42 L62 42 L58 48 L42 48 Z" 
        fill="#0f172a" 
      />
      {/* Sword Grip & Pommel */}
      <path 
        d="M48 25 L52 25 L52 42 L48 42 Z" 
        fill="#0f172a" 
      />
      <circle cx="50" cy="22" r="3" fill="#0f172a" />
      
      {/* Central line detail on blade */}
      <path 
        d="M50 45 L50 85" 
        stroke="#ffffff" 
        strokeWidth="0.5" 
        opacity="0.5"
      />
    </svg>
  );
}

