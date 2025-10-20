import React from "react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/20/solid";
import type { Step } from "@/types/stream";

interface ProgressIndicatorProps {
  steps: Step[];
}

const ThinkingDots: React.FC = () => (
  <div className="flex space-x-1">
    <div className="w-2 h-2 bg-gray400 rounded-full animate-pulse"></div>
    <div
      className="w-2 h-2 bg-gray400 rounded-full animate-pulse"
      style={{ animationDelay: "0.2s" }}
    ></div>
    <div
      className="w-2 h-2 bg-gray400 rounded-full animate-pulse"
      style={{ animationDelay: "0.4s" }}
    ></div>
  </div>
);

const LoadingSpinner: React.FC = () => (
  <div className="relative">
    <div className="w-4 h-4 border-2 border-gray300 border-t-violet2 rounded-full animate-spin"></div>
  </div>
);

const CompletedIcon: React.FC = () => (
  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
    <CheckIcon className="w-3 h-3 text-white" />
  </div>
);

const ErrorIcon: React.FC = () => (
  <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
    <XMarkIcon className="w-3 h-3 text-white" />
  </div>
);

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  steps,
}) => {
  if (steps.length === 0) return null;

  return (
    <div className="bg-gray50 rounded-xl p-4 mb-4 border border-gray200">
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-center gap-3 text-sm transition-all duration-500 ease-in-out ${
              step.status === "completed"
                ? "text-gray700"
                : step.status === "error"
                  ? "text-red-600"
                  : "text-gray600"
            }`}
            style={{
              transform: `translateY(${index * 4}px)`,
              opacity: step.status === "completed" ? 0.8 : 1,
            }}
          >
            {/* Status Icon */}
            <div className="shrink-0 flex items-center justify-center">
              {step.status === "thinking" && <ThinkingDots />}
              {step.status === "active" && <LoadingSpinner />}
              {step.status === "completed" && <CompletedIcon />}
              {step.status === "error" && <ErrorIcon />}
            </div>

            {/* Step Text */}
            <span
              className={`transition-all duration-300 ${
                step.status === "completed"
                  ? "font-medium"
                  : step.status === "active"
                    ? "font-medium text-violet2"
                    : ""
              }`}
            >
              {step.text}
            </span>

            {/* Subtle animation for active steps */}
            {step.status === "active" && (
              <div className="flex-1 relative">
                <div className="absolute inset-0 bg-linear-to-r from-transparent via-violet2/20 to-transparent animate-pulse"></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
