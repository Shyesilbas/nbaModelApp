import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./Button";
import { useLanguage } from "../../context/LanguageContext";

export interface InlineErrorProps {
  message: string;
  title?: string;
  onRetry?: () => void;
  className?: string;
}

export const InlineError: React.FC<InlineErrorProps> = ({
  message,
  title,
  onRetry,
  className = "",
}) => {
  const { t } = useLanguage();
  const resolvedTitle = title ?? t.common.error;

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded border border-status-error/30 bg-status-error/5 p-3.5 text-left text-xs ${className}`.trim()}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle
          size={16}
          className="mt-0.5 shrink-0 text-status-error"
          strokeWidth={2}
        />
        <div>
          <p className="font-semibold text-status-error">{resolvedTitle}</p>
          <p className="mt-0.5 text-text-secondary">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw size={12} />}
          className="shrink-0"
        >
          {t.common.retry}
        </Button>
      )}
    </div>
  );
};
