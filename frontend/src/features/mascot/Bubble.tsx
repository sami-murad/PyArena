interface BubbleProps {
  text: string;
}

/** The mascot's speech bubble (Comic Neue, the only place that font is used). */
export function Bubble({ text }: BubbleProps) {
  return (
    <p className="mascot__bubble" data-testid="mascot-bubble">
      {text}
    </p>
  );
}
