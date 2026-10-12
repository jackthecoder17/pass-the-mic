"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

// big poster names: shrink the font until the longest word fits instead of breaking it mid-word
function fit(el: HTMLElement | null, max: number, min = 28) {
  if (!el || !el.offsetParent) return;
  let size = Math.min(max, el.clientWidth / 3);
  el.style.fontSize = `${size}px`;
  while (size > min && el.scrollWidth > el.clientWidth + 1) { size -= 3; el.style.fontSize = `${size}px`; }
}

export function FitText({ id, className, max, children }: { id?: string; className: string; max: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // refit after every render: the text changes (countdowns, names) and so does visibility (screen switches)
  useLayoutEffect(() => fit(ref.current, max));
  useEffect(() => {
    const onResize = () => fit(ref.current, max);
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, [max]);
  return <div ref={ref} id={id} className={className}>{children}</div>;
}
