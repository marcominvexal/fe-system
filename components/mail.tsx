"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { Icons } from "./icons";
import { Button, cx, type Tone } from "./ui";
import { useUser } from "@/lib/userContext";

type Outcome = { status: string };

function describe(outcomes: Outcome[], scanned?: number) {
  const n = (s: string) => outcomes.filter((o) => o.status === s).length;
  const created = n("created"), updated = n("updated"), ignored = n("ignored"), dup = n("duplicate");
  if (!created && !updated) {
    if (scanned === 0 || outcomes.length === 0) return "No new Orange emails.";
    const parts = [ignored && `${ignored} not a work order`, dup && `${dup} already applied`].filter(Boolean);
    return `No changes${parts.length ? ` (${parts.join(", ")})` : ""}.`;
  }
  return [created && `${created} new work order${created === 1 ? "" : "s"}`, updated && `${updated} update${updated === 1 ? "" : "s"} applied`]
    .filter(Boolean).join(", ") + ".";
}

/** Sync / import actions for the Orange Business inbox, shared by pages. */
export function useMailActions(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: Tone; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (req: () => Promise<Response>, fallback: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await req();
      const data = await res.json();
      if (!res.ok) setMsg({ tone: "crit", text: data.error ?? fallback });
      else setMsg({ tone: "ok", text: describe(data.outcomes ?? [], data.scanned) });
    } catch {
      setMsg({ tone: "crit", text: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
      onDone();
    }
  };

  const sync = () => run(() => fetch("/api/mail/sync", { method: "POST" }), "Inbox sync failed.");
  const importFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    run(() => fetch("/api/mail/import", { method: "POST", body: form }), "Upload failed.")
      .finally(() => { if (fileRef.current) fileRef.current.value = ""; });
  };

  return { busy, msg, setMsg, sync, importFiles, fileRef };
}

export function MailButtons({ actions }: { actions: ReturnType<typeof useMailActions> }) {
  const { busy, sync, importFiles, fileRef } = actions;
  const { canEdit } = useUser();
  if (!canEdit) return null;
  return (
    <>
      <Button onClick={sync} disabled={busy} title="Fetch new Orange Business emails">
        <Icons.Refresh size={14} className={busy ? "animate-spin" : undefined} />{busy ? "Syncing…" : "Sync inbox"}
      </Button>
      <input ref={fileRef} type="file" accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook" multiple hidden onChange={(e) => importFiles(e.target.files)} />
      <Button onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Upload emails" title="Upload saved emails (.msg or .eml)">
        <Icons.Upload size={14} />
      </Button>
    </>
  );
}

export function MailBanner({ actions }: { actions: ReturnType<typeof useMailActions> }) {
  const { msg, setMsg } = actions;
  if (!msg) return null;
  return (
    <div role="status" className={cx("anim-fade mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-[13px]",
      msg.tone === "crit" ? "border-crit/25 bg-crit/[0.07] text-[#f08a84]" : "border-ok/25 bg-ok/[0.07] text-[#7bcfa2]")}>
      <span className="flex items-center gap-2"><Icons.Inbox size={14} />{msg.text}</span>
      <button onClick={() => setMsg(null)} aria-label="Dismiss" className="text-fg-subtle hover:text-fg"><Icons.X size={14} /></button>
    </div>
  );
}

/** Drag-and-drop target for saved Orange emails (.msg from Outlook, .eml from Gmail). */
export function MailDropZone({ actions }: { actions: ReturnType<typeof useMailActions> }) {
  const [over, setOver] = useState(false);
  const { busy, importFiles, fileRef } = actions;
  const { canEdit } = useUser();
  if (!canEdit) return null;
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    importFiles(e.dataTransfer.files);
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cx("mb-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-6 text-center transition-colors duration-150 sm:flex-row sm:gap-4 sm:text-left",
        over ? "border-brand bg-brand/[0.06]" : "border-line-strong bg-panel")}
    >
      <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-lg", over ? "bg-brand/15 text-brand" : "bg-white/[0.04] text-fg-subtle")}>
        <Icons.Upload size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-fg">{busy ? "Reading emails…" : "Drop Orange work order emails here to create cases"}</p>
        <p className="mt-0.5 text-xs text-fg-subtle">Outlook .msg or .eml files. Dispatch emails create a case; photo and cleared emails update it. You can drop several at once.</p>
      </div>
      <Button onClick={() => fileRef.current?.click()} disabled={busy}>Choose files</Button>
    </div>
  );
}
