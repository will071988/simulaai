"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const HotConcursosMap = dynamic(() => import("@/components/HotConcursosMap").then((module) => module.HotConcursosMap), { ssr: false });

export function DeferredHotConcursosMap() {
  const [active, setActive] = useState(false);
  const placeholder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = placeholder.current;
    if (!element || active) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setActive(true);
        observer.disconnect();
      }
    }, { rootMargin: "300px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active]);

  if (!active) return <div ref={placeholder} aria-label="Mapa disponível ao rolar a página" className="h-[320px] rounded-[24px] bg-white/5" />;
  return <HotConcursosMap />;
}
