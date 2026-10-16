import clsx from "clsx";
import { Check, ChevronLeft, Hammer, Link as LinkIcon, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { BotKind } from "../lib/protocol";

export { LinkIcon };

/** Round avatar: the emoji of a bot, or the hammer of Builder (the only accent avatar). */
export function Avatar({ emoji, kind, size }: { emoji: string; kind?: BotKind; size?: "s" | "l" }) {
  const cls = clsx("av", size === "s" && "av-s", size === "l" && "av-l", kind === "builder" && "av-builder");
  if (kind === "builder") {
    const px = size === "l" ? 48 : size === "s" ? 18 : 26;
    return (
      <span className={cls} aria-hidden="true">
        <Hammer className="i" width={px} height={px} strokeWidth={1.9} />
      </span>
    );
  }
  return (
    <span className={cls} aria-hidden="true">
      {emoji}
    </span>
  );
}

/** A 44 px glass circle. Needs a label for screen readers. */
export function GlassIcon({
  label,
  to,
  onClick,
  children,
}: {
  label: string;
  to?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (to) {
    return (
      <Link to={to} className="btn btn-icon glass" aria-label={label}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className="btn btn-icon glass" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function BackButton({ to = "/" }: { to?: string }) {
  return (
    <GlassIcon label="Back" to={to}>
      <ChevronLeft className="i" width={22} height={22} strokeWidth={2.2} />
    </GlassIcon>
  );
}

export function NavButtons() {
  return (
    <span style={{ display: "flex", gap: 8 }}>
      <GlassIcon label="Connections" to="/connections">
        <LinkIcon className="i" width={20} height={20} strokeWidth={1.8} />
      </GlassIcon>
      <GlassIcon label="Settings" to="/settings">
        <SlidersHorizontal className="i" width={20} height={20} strokeWidth={1.8} />
      </GlassIcon>
    </span>
  );
}

/** True once the scroller has moved, so a large title or a bar can collapse. */
export function useCollapse(threshold = 24) {
  const ref = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setCollapsed(el.scrollTop > threshold);
    el.addEventListener("scroll", on, { passive: true });
    return () => el.removeEventListener("scroll", on);
  }, [threshold]);
  return { ref, collapsed };
}

/** A list screen: glass bar, large title that shrinks on scroll, edge effect under it (D6 design). */
export function LargeTitleScreen({
  title,
  back,
  right,
  children,
  footer,
  flush,
}: {
  title: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Rows that run edge to edge, with no side padding. */
  flush?: boolean;
}) {
  const { ref, collapsed } = useCollapse();
  return (
    <div className="screen" data-collapsed={collapsed ? "" : undefined}>
      <div className="scroller" ref={ref}>
        <div
          className={flush ? undefined : "scr"}
          style={
            flush
              ? { paddingTop: "calc(var(--safe-top) + 112px)", paddingBottom: "calc(var(--safe-bottom) + 24px)" }
              : { ["--pt" as string]: "calc(var(--safe-top) + 112px)" }
          }
        >
          {children}
        </div>
      </div>
      <div className="edge edge-t" style={{ ["--edge-t" as string]: "calc(var(--safe-top) + 100px)" }} />
      <header className="bar">
        <div className="bar-row">
          {back ? <BackButton /> : <span />}
          <span className="title-sm" aria-hidden="true">
            {title}
          </span>
          {right ?? <span />}
        </div>
      </header>
      <div className="large-title-wrap">
        <h1 className="large-title" style={{ margin: 0 }}>
          {title}
        </h1>
      </div>
      {footer}
    </div>
  );
}

export function Section({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section>
      {title && <div className="sec-h">{title}</div>}
      {children}
      {footer && <div className="sec-f">{footer}</div>}
    </section>
  );
}

/** Segmented control with a sliding thumb. Arrow keys move. */
export function Segmented<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const i = Math.max(0, tabs.findIndex((t) => t.id === value));
  return (
    <div
      className="seg glass"
      role="tablist"
      style={{ ["--i" as string]: i }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onChange(tabs[Math.min(tabs.length - 1, i + 1)]!.id);
        if (e.key === "ArrowLeft") onChange(tabs[Math.max(0, i - 1)]!.id);
      }}
    >
      <span className="seg-thumb" />
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet that asks before a destructive step. */
export function ConfirmSheet({
  open,
  title,
  text,
  confirm,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text: string;
  confirm: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <div className="sheet glass" role="dialog" aria-modal="true" aria-label={title}>
        <span className="grab" />
        <h3>{title}</h3>
        <p>{text}</p>
        <button type="button" className="btn btn-danger-fill" onClick={onConfirm} disabled={busy}>
          {confirm}
        </button>
        <button type="button" className="btn btn-secondary glass-clear" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}

/** A short confirmation that leaves after 3 seconds. */
export function Toast({ trigger, children }: { trigger: number; children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!trigger) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 3000);
    return () => clearTimeout(t);
  }, [trigger]);
  if (!on) return null;
  return (
    <div className="toast-pos" role="status">
      <div className="toast glass">
        <Check className="i" width={18} height={18} strokeWidth={2.4} />
        {children}
      </div>
    </div>
  );
}

/** Floating Discard and Save pair. It shows only when the form has changes. */
export function SaveBar({ onDiscard, busy, form }: { onDiscard: () => void; busy?: boolean; form?: string }) {
  return (
    <div className="save-bar glass">
      <button type="button" className="btn btn-secondary glass-clear" onClick={onDiscard}>
        Discard
      </button>
      <button type="submit" form={form} className="btn btn-primary" disabled={busy}>
        Save changes
      </button>
    </div>
  );
}

export function LogoTile({ src, name, small }: { src?: string; name: string; small?: boolean }) {
  return (
    <span className={clsx("logo", small && "logo-s")} aria-hidden="true">
      {src ? <img src={src} alt="" /> : <b>{name.slice(0, 1).toUpperCase()}</b>}
    </span>
  );
}
