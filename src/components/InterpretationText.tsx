import React, { useEffect, useState } from "react";

interface InterpretationTextProps {
  text: string;
  isStreaming: boolean;
}

export const InterpretationText: React.FC<InterpretationTextProps> = ({
  text,
  isStreaming,
}) => {
  const [displayText, setDisplayText] = useState("");
  const [showCursor, setShowCursor] = useState(false);

  useEffect(() => {
    if (!text) {
      setDisplayText("");
      setShowCursor(false);
      return;
    }

    if (isStreaming) {
      setShowCursor(true);
      // For streaming, we show the text as it comes in
      setDisplayText(text);
    } else {
      setShowCursor(false);
      setDisplayText(text);
    }
  }, [text, isStreaming]);

  if (!displayText && !isStreaming) return null;

  // Parse markdown-like formatting for basic styling
  const formatText = (input: string) => {
    return (
      input
        // Bold text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        // Bullet points
        .replace(/^- (.*$)/gim, "• $1")
        // Line breaks
        .replace(/\n/g, "<br />")
    );
  };

  return (
    <div className="bg-white border border-gray300 rounded-2xl p-6 mt-6 shadow-sm animate-fade-in">
    
      <div
        className={`prose prose-sm max-w-none text-gray700 leading-relaxed ${
          showCursor ? "typing-cursor" : ""
        }`}
        dangerouslySetInnerHTML={{
          __html: formatText(displayText),
        }}
      />
      {isStreaming && !displayText && (
        <div className="flex items-center text-gray600 text-sm">
          <div className="loading-dots mr-3">
            <span></span>
            <span></span>
            <span></span>
          </div>
          Analyzing results...
        </div>
      )}
    </div>
  );
};
