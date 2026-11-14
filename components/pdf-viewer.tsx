"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { pdfjs, pdfUrl, message } from "@/lib/client";
import type { Submission } from "@/lib/model";
export function PdfViewer({
  submission,
  page = 1,
  onReady,
  dark = false,
  sourceUrl,
  onPages,
}: {
  submission: Submission;
  page?: number;
  onReady?: () => void;
  dark?: boolean;
  sourceUrl?: string;
  onPages?: (pages: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    ready = useRef(onReady),
    pagesReady = useRef(onPages);
  pagesReady.current = onPages;
  ready.current = onReady;
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [size, setSize] = useState({ w: 800, h: 500 }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const el = host.current!;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false,
      document: PDFDocumentProxy | undefined,
      objectUrl: string | undefined;
    setDoc(null);
    setError("");
    setLoading(true);
    (async () => {
      const [lib, url] = await Promise.all([
        pdfjs(),
        sourceUrl ?? pdfUrl(submission),
      ]);
      objectUrl = url;
      const task = lib.getDocument({ url });
      task.onPassword = () => {
        void task.destroy();
        if (!disposed) setError("암호화된 PDF는 표시할 수 없습니다.");
      };
      document = await task.promise;
      if (disposed) {
        await document.destroy();
        return;
      }
      setDoc(document);
      pagesReady.current?.(document.numPages);
    })().catch((e) => {
      if (!disposed) {
        setError(message(e));
        setLoading(false);
      }
    });
    return () => {
      disposed = true;
      void document?.destroy();
      if (objectUrl?.startsWith("blob:")) URL.revokeObjectURL(objectUrl);
    };
  }, [submission.id, sourceUrl, retry]);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false,
      task: RenderTask | undefined;
    setLoading(true);
    setError("");
    (async () => {
      const pdfPage = await doc.getPage(
        Math.min(doc.numPages, Math.max(1, page)),
      );
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 }),
        scale = Math.min(
          (size.w - 16) / base.width,
          (size.h - 16) / base.height,
        ),
        ratio = Math.min(devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({
        scale: Math.max(0.1, scale) * ratio,
      });
      const el = canvas.current!;
      el.width = viewport.width;
      el.height = viewport.height;
      el.style.width = `${viewport.width / ratio}px`;
      el.style.height = `${viewport.height / ratio}px`;
      task = pdfPage.render({ canvas: el, viewport });
      await task.promise;
      if (!cancelled) {
        setLoading(false);
        ready.current?.();
      }
    })().catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException") {
        setError(message(e));
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, size]);
  return (
    <div
      ref={host}
      className={`pdf-canvas ${dark ? "dark" : ""}`}
      aria-label={`PDF ${page} / ${submission.pages}페이지`}
      aria-busy={loading}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${submission.name}, ${page}페이지`}
      />
      {loading && !error && (
        <div className="pdf-overlay">
          <LoaderCircle className="spin" />
          <span>발표자료를 불러오는 중</span>
        </div>
      )}
      {error && (
        <div className="pdf-overlay">
          <AlertCircle />
          <strong>자료를 불러오지 못했습니다</strong>
          <span>{error}</span>
          <button
            className="btn secondary"
            onClick={() => setRetry((x) => x + 1)}
          >
            <RefreshCw size={16} />
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
export function PdfEmpty() {
  return (
    <div className="pdf-empty">
      <div className="empty-icon">
        <FileText size={30} />
      </div>
      <h3>아직 제출된 발표자료가 없어요</h3>
      <p>PDF를 제출하면 이곳에서 미리 볼 수 있습니다.</p>
    </div>
  );
}
