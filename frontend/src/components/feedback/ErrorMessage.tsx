import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/Button";

interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  children?: ReactNode;
}

export function ErrorMessage({ title = "Something went wrong", message, onRetry, children }: ErrorMessageProps) {
  return (
    <div className="notice notice--danger" role="alert">
      <AlertTriangle size={20} aria-hidden className="notice__icon" />
      <div className="notice__content">
        <p className="notice__title">{title}</p>
        <p className="notice__text">{message}</p>
        {children}
      </div>
      {onRetry && (
        <Button size="sm" variant="ghost" icon={<RotateCw size={16} aria-hidden />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
