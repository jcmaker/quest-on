"use client";

import React from "react";

interface CopyProtectorProps {
  children: React.ReactNode;
  className?: string;
  metadata?: Record<string, any>;
}

export function CopyProtector({ children, className, metadata }: CopyProtectorProps) {
  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()?.toString() ?? "";
    if (!selection) return;

    // Add custom internal tag
    e.clipboardData.setData("application/x-queston-internal", "true");
    
    // Add metadata if provided
    if (metadata) {
      try {
        e.clipboardData.setData("application/x-queston-meta", JSON.stringify(metadata));
      } catch (err) {
        console.error("Failed to serialize metadata for copy event", err);
      }
    }

    // Allow default copy behavior (text/plain etc.) to proceed
  };

  return (
    <div onCopy={handleCopy} className={className}>
      {children}
    </div>
  );
}

