import React, { useRef, useState } from "react";

interface SpecularCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  tint?: string;
  textColor?: string;
  baseColor?: string;
  lineColor?: string;
}

export function SpecularCard({
  children,
  className = "",
  style = {},
  tint = "#ffffff",
  textColor = "#0f172a",
  baseColor = "#e2e8f0",
  lineColor = "#424B35",
}: SpecularCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        display: "inherit",
        alignItems: "inherit",
        gap: "inherit",
        color: textColor,
        borderRadius: "inherit", // inherit from the dashboard-metric outer card
        zIndex: 0, // Create stacking context
        ...style,
      }}
    >
      {/* Base border color layer */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background: baseColor,
          zIndex: -1,
          borderRadius: "inherit",
        }}
      />
      {/* Specular highlight tracking mouse */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(350px circle at ${position.x}px ${position.y}px, ${lineColor}, transparent 50%)`,
          zIndex: -1,
          borderRadius: "inherit",
        }}
      />
      {/* Inner fill layer (leaves 1px for the border to show) */}
      <div
        style={{
          position: "absolute",
          inset: "1px",
          background: tint,
          borderRadius: "inherit",
          zIndex: -1,
        }}
      />
      {/* Content */}
      {children}
    </div>
  );
}
