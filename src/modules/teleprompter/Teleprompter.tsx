import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// Runs inside the "teleprompter" overlay webview. Receives plain text from the
// main window and auto-scrolls it; a hover control bar tweaks playback.
const SPEED_STEP = 15; // px/sec per keypress / button
const FONT_STEP = 4; // px per button
const MIN_SPEED = 0;
const MAX_SPEED = 400;
const MIN_FONT = 16;
const MAX_FONT = 120;

const clampSpeed = (v: number): number => Math.max(MIN_SPEED, Math.min(MAX_SPEED, v));
const clampFont = (v: number): number => Math.max(MIN_FONT, Math.min(MAX_FONT, v));

// Hover reveal lives in CSS so the root needs no mouse handlers (and no a11y
// static-element-interaction warning).
const STYLE = `
.tp-bar { opacity: 0; transition: opacity 150ms ease; }
.tp-root:hover .tp-bar { opacity: 1; }
`;

export function Teleprompter(): React.ReactElement {
  const [text, setText] = useState("");
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(60); // px/sec
  const [fontSize, setFontSize] = useState(40);
  const [mirror, setMirror] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  // Refs mirror the live paused/speed so the rAF loop reads them without being
  // re-created (re-subscribed) on every state change.
  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  pausedRef.current = paused;
  speedRef.current = speed;

  // Content bridge: announce readiness, then accept text from the main window.
  useEffect(() => {
    void emit("teleprompter:ready");
    const un = listen<{ text: string }>("teleprompter:set", (e) => setText(e.payload.text));
    return () => {
      void un.then((off) => off());
    };
  }, []);

  // Single rAF auto-scroll loop. Branch-light: one guard, one clamp.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const el = scrollerRef.current;
      if (el && !pausedRef.current) {
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = Math.min(el.scrollTop + speedRef.current * dt, max);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keys: Space = pause, ArrowUp/Down = speed, Esc = close this webview window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSpeed((s) => clampSpeed(s + SPEED_STEP));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSpeed((s) => clampSpeed(s - SPEED_STEP));
      } else if (e.key === "Escape") {
        void getCurrentWebviewWindow().close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="tp-root" style={rootStyle}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static CSS string */}
      <style dangerouslySetInnerHTML={{ __html: STYLE }} />
      <div ref={scrollerRef} style={scrollerStyle}>
        <div style={{ fontSize, transform: mirror ? "scaleX(-1)" : undefined, ...textStyle }}>
          {text}
        </div>
      </div>
      <div className="tp-bar" style={barStyle}>
        <button type="button" style={btnStyle} onClick={() => setPaused((p) => !p)}>
          {paused ? "Play" : "Pause"}
        </button>
        <button
          type="button"
          style={btnStyle}
          onClick={() => setSpeed((s) => clampSpeed(s - SPEED_STEP))}
        >
          Speed -
        </button>
        <button
          type="button"
          style={btnStyle}
          onClick={() => setSpeed((s) => clampSpeed(s + SPEED_STEP))}
        >
          Speed +
        </button>
        <button
          type="button"
          style={btnStyle}
          onClick={() => setFontSize((f) => clampFont(f - FONT_STEP))}
        >
          Font -
        </button>
        <button
          type="button"
          style={btnStyle}
          onClick={() => setFontSize((f) => clampFont(f + FONT_STEP))}
        >
          Font +
        </button>
        <button type="button" style={btnStyle} onClick={() => setMirror((m) => !m)}>
          {mirror ? "Unmirror" : "Mirror"}
        </button>
        <button
          type="button"
          aria-label="Close teleprompter"
          style={btnStyle}
          onClick={() => void getCurrentWebviewWindow().close()}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#000",
  color: "#fff",
  overflow: "hidden",
  // Rounded bottom corners read as a wider notch; the square top edge is bled
  // off-screen (negative Y in the panel) so it sits flush behind the notch with
  // no gap. The transparent window shows through outside the radius.
  borderBottomLeftRadius: 22,
  borderBottomRightRadius: 22,
};

const scrollerStyle: React.CSSProperties = {
  height: "100%",
  width: "100%",
  overflow: "hidden",
  display: "flex",
  justifyContent: "center",
  // Clear the notch / top edge so the first lines are not hidden under it.
  paddingTop: "2.25rem",
};

const textStyle: React.CSSProperties = {
  // Match the app's default UI font (body uses Geist Variable) instead of the
  // webview's UA default serif.
  fontFamily:
    '"Geist Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  maxWidth: "90%",
  padding: "1rem",
  textAlign: "center",
  fontWeight: 600,
  lineHeight: 1.3,
  whiteSpace: "pre-wrap",
};

const barStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  display: "flex",
  gap: "0.5rem",
  justifyContent: "center",
  padding: "0.35rem",
  background: "rgba(0,0,0,0.6)",
};

const btnStyle: React.CSSProperties = {
  background: "#222",
  color: "#fff",
  border: "1px solid #444",
  borderRadius: 4,
  padding: "0.2rem 0.5rem",
  fontSize: 12,
  cursor: "pointer",
};
