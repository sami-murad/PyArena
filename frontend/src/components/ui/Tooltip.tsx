import { cloneElement, isValidElement, useId, type ReactElement } from "react";

interface TooltipProps {
  content: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
  side?: "top" | "bottom";
}

/** CSS tooltip that appears on hover and keyboard focus, linked with aria-describedby. */
export function Tooltip({ content, children, side = "bottom" }: TooltipProps) {
  const id = useId();
  if (!isValidElement(children)) return children;
  return (
    <span className={`tooltip tooltip--${side}`}>
      {cloneElement(children, { "aria-describedby": id })}
      <span role="tooltip" id={id} className="tooltip__bubble">
        {content}
      </span>
    </span>
  );
}
