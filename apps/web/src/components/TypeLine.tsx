import { useEffect, useState } from "react";

export default function TypeLine({
  phrases,
  className = "",
}: {
  phrases: string[];
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const phrase = phrases[idx % phrases.length] ?? "";
    let timer: ReturnType<typeof setTimeout>;
    if (!deleting && text.length < phrase.length) {
      timer = setTimeout(() => setText(phrase.slice(0, text.length + 1)), 48);
    } else if (!deleting && text.length === phrase.length) {
      timer = setTimeout(() => setDeleting(true), 2200);
    } else if (deleting && text.length > 0) {
      timer = setTimeout(() => setText(text.slice(0, -1)), 24);
    } else {
      setDeleting(false);
      setIdx((v) => (v + 1) % phrases.length);
    }
    return () => clearTimeout(timer);
  }, [text, deleting, idx, phrases]);

  return (
    <span className={className}>
      {text}
      <span className="orig-type-cursor" aria-hidden>
        _
      </span>
    </span>
  );
}
