import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(value: string) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map(channel => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(h: number, s: number, v: number) {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  return match ? `#${match[1].toUpperCase()}` : null;
}

function isEyeDropperAvailable() {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

function EyeDropperIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <mask id="eyedropper-mask" maskUnits="userSpaceOnUse" x="-23.0889" y="-22.9231" width="226.274" height="226.274" fill="black">
        <rect fill="white" x="-23.0889" y="-22.9231" width="226.274" height="226.274" />
        <path d="M160.284 19.0289C165.571 24.3151 165.571 32.8861 160.285 38.1725L145.539 52.9189L157.697 65.0771C161.412 68.7918 161.412 74.8147 157.698 78.5294C153.983 82.2442 147.96 82.2441 144.245 78.5294L138.553 72.838L71.5371 139.854C68.8585 142.533 65.3851 144.274 61.6362 144.817L50.4709 146.433L36.6264 160.278C31.7687 165.135 23.8934 165.135 19.0358 160.278C14.1781 155.42 14.1776 147.544 19.0351 142.686L33.2711 128.45L34.947 118.029C35.5337 114.382 37.2557 111.013 39.8678 108.401L106.992 41.2765L101.431 35.7156C97.7162 32.0009 97.7162 25.9774 101.431 22.2626C105.146 18.5482 111.168 18.5483 114.883 22.2626L126.395 33.7752L141.142 19.0289C146.428 13.7429 154.998 13.7429 160.284 19.0289Z" />
      </mask>
      <path d="M160.284 19.0289C165.571 24.3151 165.571 32.8861 160.285 38.1725L145.539 52.9189L157.697 65.0771C161.412 68.7918 161.412 74.8147 157.698 78.5294C153.983 82.2442 147.96 82.2441 144.245 78.5294L138.553 72.838L71.5371 139.854C68.8585 142.533 65.3851 144.274 61.6362 144.817L50.4709 146.433L36.6264 160.278C31.7687 165.135 23.8934 165.135 19.0358 160.278C14.1781 155.42 14.1776 147.544 19.0351 142.686L33.2711 128.45L34.947 118.029C35.5337 114.382 37.2557 111.013 39.8678 108.401L106.992 41.2765L101.431 35.7156C97.7162 32.0009 97.7162 25.9774 101.431 22.2626C105.146 18.5482 111.168 18.5483 114.883 22.2626L126.395 33.7752L141.142 19.0289C146.428 13.7429 154.998 13.7429 160.284 19.0289Z" fill="black" />
      <path d="M160.284 19.0289L167.356 11.9578L167.355 11.9576L160.284 19.0289ZM160.285 38.1725L167.356 45.2436L167.356 45.2434L160.285 38.1725ZM145.539 52.9189L138.468 45.8478L131.397 52.9189L138.468 59.99L145.539 52.9189ZM157.697 65.0771L150.626 72.1482L150.626 72.1482L157.697 65.0771ZM157.698 78.5294L164.769 85.6005L164.769 85.6004L157.698 78.5294ZM144.245 78.5294L137.174 85.6005L137.174 85.6005L144.245 78.5294ZM138.553 72.838L145.624 65.767L138.553 58.6959L131.482 65.767L138.553 72.838ZM61.6362 144.817L63.0691 154.713L63.0695 154.713L61.6362 144.817ZM50.4709 146.433L49.038 136.536L45.7495 137.012L43.3999 139.362L50.4709 146.433ZM36.6264 160.278L43.6973 167.349L43.6975 167.349L36.6264 160.278ZM19.0358 160.278L11.9647 167.349L11.9648 167.349L19.0358 160.278ZM19.0351 142.686L11.964 135.615L11.9638 135.615L19.0351 142.686ZM33.2711 128.45L40.3422 135.521L42.6304 133.233L43.1443 130.038L33.2711 128.45ZM34.947 118.029L25.0739 116.441L25.0739 116.441L34.947 118.029ZM39.8678 108.401L32.7967 101.329L32.7967 101.33L39.8678 108.401ZM106.992 41.2765L114.063 48.3476L121.134 41.2765L114.063 34.2054L106.992 41.2765ZM101.431 35.7156L108.502 28.6446L108.502 28.6445L101.431 35.7156ZM101.431 22.2626L94.3601 15.1914L94.3599 15.1916L101.431 22.2626ZM114.883 22.2626L121.954 15.1916L121.953 15.1912L114.883 22.2626ZM126.395 33.7752L119.324 40.8463L126.395 47.9174L133.466 40.8463L126.395 33.7752ZM141.142 19.0289L134.071 11.9576L134.07 11.9578L141.142 19.0289ZM160.284 19.0289L153.213 26.0999C154.595 27.4814 154.595 29.7209 153.214 31.1017L160.285 38.1725L167.356 45.2434C176.548 36.0514 176.547 21.1489 167.356 11.9578L160.284 19.0289ZM160.285 38.1725L153.214 31.1015L138.468 45.8478L145.539 52.9189L152.61 59.99L167.356 45.2436L160.285 38.1725ZM145.539 52.9189L138.468 59.99L150.626 72.1482L157.697 65.0771L164.768 58.0061L152.61 45.8478L145.539 52.9189ZM157.697 65.0771L150.626 72.1482C150.436 71.9585 150.435 71.6497 150.627 71.4584L157.698 78.5294L164.769 85.6004C172.39 77.9796 172.387 65.6251 164.768 58.006L157.697 65.0771ZM157.698 78.5294L150.627 71.4584C150.817 71.2678 151.125 71.2679 151.316 71.4583L144.245 78.5294L137.174 85.6005C144.794 93.2204 157.149 93.2205 164.769 85.6005L157.698 78.5294ZM144.245 78.5294L151.316 71.4583L145.624 65.767L138.553 72.838L131.482 79.9091L137.174 85.6005L144.245 78.5294ZM138.553 72.838L131.482 65.767L64.466 132.783L71.5371 139.854L78.6081 146.925L145.624 79.9091L138.553 72.838ZM71.5371 139.854L64.466 132.783C63.313 133.936 61.8173 134.686 60.2029 134.92L61.6362 144.817L63.0695 154.713C68.9529 153.861 74.404 151.13 78.6081 146.925L71.5371 139.854ZM61.6362 144.817L60.2033 134.92L49.038 136.536L50.4709 146.433L51.9038 156.33L63.0691 154.713L61.6362 144.817ZM50.4709 146.433L43.3999 139.362L29.5554 153.207L36.6264 160.278L43.6975 167.349L57.542 153.504L50.4709 146.433ZM36.6264 160.278L29.5556 153.206C28.6029 154.159 27.0591 154.159 26.1067 153.206L19.0358 160.278L11.9648 167.349C20.7278 176.111 34.9345 176.111 43.6973 167.349L36.6264 160.278ZM19.0358 160.278L26.1068 153.207C25.1539 152.254 25.1544 150.709 26.1063 149.757L19.0351 142.686L11.9638 135.615C3.20082 144.379 3.20232 158.586 11.9647 167.349L19.0358 160.278ZM19.0351 142.686L26.1061 149.757L40.3422 135.521L33.2711 128.45L26.2001 121.379L11.964 135.615L19.0351 142.686ZM33.2711 128.45L43.1443 130.038L44.8202 119.617L34.947 118.029L25.0739 116.441L23.398 126.862L33.2711 128.45ZM34.947 118.029L44.8202 119.617C45.0727 118.047 45.8141 116.596 46.9389 115.472L39.8678 108.401L32.7967 101.33C28.6973 105.429 25.9946 110.717 25.0739 116.441L34.947 118.029ZM39.8678 108.401L46.9389 115.472L114.063 48.3476L106.992 41.2765L99.9208 34.2054L32.7967 101.329L39.8678 108.401ZM106.992 41.2765L114.063 34.2054L108.502 28.6446L101.431 35.7156L94.3599 42.7867L99.9208 48.3476L106.992 41.2765ZM101.431 35.7156L108.502 28.6445C108.693 28.8351 108.692 29.1432 108.502 29.3337L101.431 22.2626L94.3599 15.1916C86.74 22.8115 86.7399 35.1667 94.3599 42.7867L101.431 35.7156ZM101.431 22.2626L108.502 29.3339C108.311 29.5246 108.002 29.5243 107.812 29.3341L114.883 22.2626L121.953 15.1912C114.334 7.57224 101.98 7.57182 94.3601 15.1914L101.431 22.2626ZM114.883 22.2626L107.811 29.3337L119.324 40.8463L126.395 33.7752L133.466 26.7042L121.954 15.1916L114.883 22.2626ZM126.395 33.7752L133.466 40.8463L148.213 26.0999L141.142 19.0289L134.07 11.9578L119.324 26.7042L126.395 33.7752ZM141.142 19.0289L148.212 26.1002C149.593 24.7192 151.833 24.7192 153.214 26.1002L160.284 19.0289L167.355 11.9576C158.164 2.76668 143.262 2.7667 134.071 11.9576L141.142 19.0289Z" fill="white" mask="url(#eyedropper-mask)" />
      <path d="M131.956 66.2419L113.847 48.1331L58.2268 103.753L94.1858 104.012L131.956 66.2419Z" fill="white" />
    </svg>
  );
}

export function ColorInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const satRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [panelReady, setPanelReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [dragMode, setDragMode] = useState<null | 'sv' | 'hue'>(null);
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  const rgb = useMemo(() => parseHexColor(value), [value]);
  const hsv = useMemo(() => rgbToHsv(rgb.r, rgb.g, rgb.b), [rgb.r, rgb.g, rgb.b]);
  const saturationColor = useMemo(() => {
    const pure = hsvToRgb(hsv.h, 1, 1);
    return rgbToHex(pure.r, pure.g, pure.b);
  }, [hsv.h]);
  const pickerPopover = open ? (
    <div
      className="color-picker-popover"
      ref={panelRef}
      style={{ ...panelStyle, visibility: panelReady ? 'visible' : 'hidden' }}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <div className="color-picker-header" onPointerDown={event => event.stopPropagation()}>
        <button
          type="button"
          className="color-picker-icon-button"
          aria-label="吸管取色"
          disabled={!isEyeDropperAvailable()}
          onClick={async () => {
            if (!isEyeDropperAvailable()) return;
            try {
              const dropper = new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper();
              const result = await dropper.open();
              const next = normalizeHexColor(result.sRGBHex);
              if (next) onChange(next);
            } catch {
            }
          }}
        >
          <EyeDropperIcon />
        </button>
        <div className="color-picker-hex">
          <input
            type="text"
            spellCheck={false}
            value={hexDraft}
            onChange={event => {
              const nextDraft = event.currentTarget.value;
              setHexDraft(nextDraft);
              const next = normalizeHexColor(nextDraft);
              if (next) onChange(next);
            }}
            onBlur={() => {
              const normalized = normalizeHexColor(hexDraft);
              setHexDraft((normalized ?? value).toUpperCase());
              if (normalized) onChange(normalized);
            }}
          />
        </div>
      </div>
      <div
        className="color-picker-sat"
        ref={satRef}
        style={{ '--sat-color': saturationColor } as React.CSSProperties & { '--sat-color': string }}
        onPointerDown={event => {
          event.stopPropagation();
          event.preventDefault();
          setDragMode('sv');
          const rect = satRef.current?.getBoundingClientRect();
          if (!rect) return;
          const s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
          const v = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
          const next = hsvToRgb(hsv.h, s, v);
          onChange(rgbToHex(next.r, next.g, next.b));
        }}
      >
        <div
          className="color-picker-sat-thumb"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div className="color-picker-toolbar">
        <div className="color-picker-preview" style={{ '--preview-color': value } as React.CSSProperties & { '--preview-color': string }} />
        <div
          className="color-picker-hue"
          ref={hueRef}
          onPointerDown={event => {
            event.stopPropagation();
            event.preventDefault();
            setDragMode('hue');
            const rect = hueRef.current?.getBoundingClientRect();
            if (!rect) return;
            const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
            const next = hsvToRgb(ratio * 360, hsv.s, hsv.v);
            onChange(rgbToHex(next.r, next.g, next.b));
          }}
        >
          <div className="color-picker-hue-track" />
          <div className="color-picker-hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
        </div>
      </div>
      <div className="color-picker-rgb" onPointerDown={event => event.stopPropagation()}>
        {([
          ['R', 'r'],
          ['G', 'g'],
          ['B', 'b'],
        ] as const).map(([label, key]) => (
          <label key={key}>
            <input
              type="number"
              min={0}
              max={255}
              value={rgb[key]}
              onChange={event => {
                if (Number.isNaN(event.currentTarget.valueAsNumber)) return;
                const nextRgb = { ...rgb, [key]: clamp(event.currentTarget.valueAsNumber, 0, 255) };
                onChange(rgbToHex(nextRgb.r, nextRgb.g, nextRgb.b));
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  ) : null;

  useEffect(() => {
    setHexDraft(value.toUpperCase());
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const panel = panelRef.current;
      const target = event.target;
      if (
        target instanceof Node &&
        root &&
        !root.contains(target) &&
        !panel?.contains(target)
      ) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    setPanelReady(false);

    const updatePlacement = () => {
      const anchor = rootRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!anchor || !panel) return;

      const gap = 10;
      const margin = 12;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelWidth = panel.width;
      const panelHeight = panel.height;

      let left = anchor.left;
      let placementX: 'left' | 'right' = 'left';
      if (anchor.left + panelWidth > viewportWidth - margin && anchor.right - panelWidth >= margin) {
        left = anchor.right - panelWidth;
        placementX = 'right';
      } else {
        left = clamp(anchor.left, margin, Math.max(margin, viewportWidth - panelWidth - margin));
      }

      let top = anchor.bottom + gap;
      let placementY: 'bottom' | 'top' = 'bottom';
      if (top + panelHeight > viewportHeight - margin && anchor.top - gap - panelHeight >= margin) {
        top = anchor.top - gap - panelHeight;
        placementY = 'top';
      } else {
        top = clamp(top, margin, Math.max(margin, viewportHeight - panelHeight - margin));
      }

      setPanelStyle({
        left,
        top,
        transformOrigin: `${placementY === 'top' ? 'bottom' : 'top'} ${placementX === 'right' ? 'right' : 'left'}`,
      });
      setPanelReady(true);
    };

    const frame = window.requestAnimationFrame(updatePlacement);
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [open]);

  useEffect(() => {
    if (dragMode === null) return;

    const updateSvFromPointer = (clientX: number, clientY: number) => {
      const area = satRef.current;
      if (!area) return;
      const rect = area.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const s = clamp((clientX - rect.left) / rect.width, 0, 1);
      const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
      const next = hsvToRgb(hsv.h, s, v);
      onChange(rgbToHex(next.r, next.g, next.b));
    };

    const updateHueFromPointer = (clientX: number) => {
      const slider = hueRef.current;
      if (!slider) return;
      const rect = slider.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const next = hsvToRgb(ratio * 360, hsv.s, hsv.v);
      onChange(rgbToHex(next.r, next.g, next.b));
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (dragMode === 'sv') updateSvFromPointer(event.clientX, event.clientY);
      if (dragMode === 'hue') updateHueFromPointer(event.clientX);
    };

    const handlePointerUp = () => setDragMode(null);

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragMode, hsv.h, hsv.s, hsv.v, onChange]);

  return (
    <div className="color-input" ref={rootRef}>
      <button
        type="button"
        className="color-swatch-button"
        style={{ '--swatch-color': value } as React.CSSProperties & { '--swatch-color': string }}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      />
      {pickerPopover ? createPortal(pickerPopover, document.body) : null}
    </div>
  );
}
