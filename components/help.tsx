"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useId,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileText,
  HelpCircle,
  X,
} from "lucide-react";
import {
  guides,
  type GuideRole,
  type GuideStep,
  type Language,
} from "@/lib/guide";
import { PdfViewer } from "./pdf-viewer";
import type { Submission } from "@/lib/model";

const HelpContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({ language: "ko", setLanguage: () => {} });
export function HelpProvider({ children }: { children: ReactNode }) {
  const [language, update] = useState<Language>("ko");
  useEffect(() => {
    if (localStorage.getItem("cue-help-language") === "en") update("en");
  }, []);
  return (
    <HelpContext.Provider
      value={{
        language,
        setLanguage: (value) => {
          update(value);
          localStorage.setItem("cue-help-language", value);
        },
      }}
    >
      {children}
    </HelpContext.Provider>
  );
}
export function useHelpLanguage() {
  return useContext(HelpContext);
}
export function HelpLanguage() {
  const { language, setLanguage } = useHelpLanguage();
  return (
    <div className="help-language" aria-label="Guide language">
      <button
        type="button"
        aria-pressed={language === "ko"}
        onClick={() => setLanguage("ko")}
      >
        한국어
      </button>
      <button
        type="button"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        English
      </button>
    </div>
  );
}
const manual: Submission = {
  id: "manual",
  name: "큐시트 사용설명서",
  path: "",
  pages: 24,
  bytes: 0,
  event_id: "",
  team_id: "",
  created_at: "",
};
export function ManualButton() {
  const { language } = useHelpLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(1),
    [pages, setPages] = useState(24);
  const titleId = useId();
  const url = `/manuals/cuesheet-${language}.pdf`;
  useEffect(() => {
    setPage(1);
  }, [language]);
  return (
    <>
      <button
        type="button"
        className="btn secondary manual-button"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <FileText size={16} />
        {language === "ko" ? "PDF 사용설명서 보기" : "View PDF manual"}
      </button>
      <dialog
        className="manual-dialog"
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="manual-content">
          <header>
            <h2 id={titleId}>
              {language === "ko"
                ? "큐:시트 사용설명서"
                : "Cue Sheet user manual"}
            </h2>
            <HelpLanguage />
            <button
              type="button"
              className="icon-btn"
              aria-label={language === "ko" ? "설명서 닫기" : "Close manual"}
              onClick={() => dialog.current?.close()}
              autoFocus
            >
              <X size={20} />
            </button>
          </header>
          {open && (
            <div className="manual-preview">
              <PdfViewer
                submission={manual}
                sourceUrl={url}
                page={page}
                onPages={setPages}
              />
            </div>
          )}
          <footer>
            <div className="button-row">
              <button
                type="button"
                className="btn secondary"
                disabled={page <= 1}
                aria-label={language === "ko" ? "이전 페이지" : "Previous page"}
                onClick={() => setPage(page - 1)}
              >
                <ArrowLeft size={16} />
              </button>
              <span aria-live="polite">
                {page} / {pages}
              </span>
              <button
                type="button"
                className="btn secondary"
                disabled={page >= pages}
                aria-label={language === "ko" ? "다음 페이지" : "Next page"}
                onClick={() => setPage(page + 1)}
              >
                <ArrowRight size={16} />
              </button>
            </div>
            <a className="btn primary" href={url} download>
              <Download size={16} />
              {language === "ko" ? "PDF 다운로드" : "Download PDF"}
            </a>
          </footer>
        </div>
      </dialog>
    </>
  );
}

type Rect = { left: number; top: number; width: number; height: number };
export function HelpGuide({
  role,
  prepare,
}: {
  role: GuideRole;
  prepare?: (step: GuideStep) => void;
}) {
  const { language } = useHelpLanguage();
  const [index, setIndex] = useState<number | null>(null),
    [rect, setRect] = useState<Rect | null>(null);
  const trigger = useRef<HTMLButtonElement>(null),
    tip = useRef<HTMLDivElement>(null);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const steps = guides[role],
    current = index === null ? null : steps[index];
  const titleId = useId();
  const close = () => {
    setIndex(null);
    trigger.current?.focus();
  };
  useEffect(() => {
    setIndex(null);
  }, [role]);
  useEffect(() => {
    if (!current) return;
    prepareRef.current?.(current);
    document
      .querySelector(current.target)
      ?.querySelectorAll<HTMLDetailsElement>("details[data-guide-expand]")
      .forEach((details) => {
        details.open = true;
      });
    setRect(null);
    let previous = "",
      scrolled = false;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(current.target);
      if (!el || !el.getClientRects().length) {
        setRect(null);
        return;
      }
      if (!scrolled) {
        el.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "instant",
        });
        scrolled = true;
      }
      const r = el.getBoundingClientRect();
      const value = {
        left: Math.max(5, r.left - 7),
        top: Math.max(5, r.top - 7),
        width: Math.min(innerWidth - 10, r.width + 14),
        height: Math.min(innerHeight - 10, r.height + 14),
      };
      value.width = Math.min(value.width, innerWidth - value.left - 5);
      value.height = Math.min(value.height, innerHeight - value.top - 5);
      const key = JSON.stringify(value);
      if (key !== previous) {
        previous = key;
        setRect(value);
      }
    };
    const advance = () => {
      if (
        current.id === "start" ||
        current.id === "practice" ||
        index === steps.length - 1
      )
        setIndex(null);
      else
        setIndex((n) =>
          n === null ? null : Math.min(n + 1, steps.length - 1),
        );
    };
    const completed = (event: Event) => {
      if (
        current.actions?.includes(
          (event as CustomEvent<{ kind: string }>).detail.kind,
        )
      )
        advance();
    };
    const nextByClick = (event: MouseEvent) => {
      const el = document.querySelector(current.target);
      if (
        current.advanceOnClick &&
        (event.target as HTMLElement).closest("button") &&
        el?.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest("button:disabled")
      ) {
        window.setTimeout(advance, 180);
      }
    };
    measure();
    const interval = setInterval(measure, 180);
    document.addEventListener("click", nextByClick);
    window.addEventListener("cue-command-complete", completed);
    tip.current?.focus();
    return () => {
      clearInterval(interval);
      document.removeEventListener("click", nextByClick);
      window.removeEventListener("cue-command-complete", completed);
    };
  }, [current, steps.length]);
  useEffect(() => {
    if (index === null) return;
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab") {
        const target = current
          ? document.querySelector<HTMLElement>(current.target)
          : null;
        const selector =
          "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary";
        const controls = [
          ...(target?.matches(selector) ? [target] : []),
          ...Array.from(target?.querySelectorAll<HTMLElement>(selector) ?? []),
          ...Array.from(
            tip.current?.querySelectorAll<HTMLElement>(selector) ?? [],
          ),
        ].filter((el) => el.getClientRects().length);
        if (!controls.length) return;
        const at = controls.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        controls[
          (at + (event.shiftKey ? controls.length - 1 : 1)) % controls.length
        ].focus();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [index, current]);
  let position: { left: number; top: number } = { left: 20, top: 90 };
  if (current && typeof window !== "undefined") {
    const width = Math.min(360, innerWidth - 32),
      height = tip.current?.offsetHeight ?? 300;
    const right = rect ? rect.left + rect.width + 18 : 20;
    position = {
      left:
        rect && right + width <= innerWidth - 16
          ? right
          : Math.max(
              16,
              Math.min(
                rect?.left ?? (innerWidth - width) / 2,
                innerWidth - width - 16,
              ),
            ),
      top:
        rect && right + width <= innerWidth - 16
          ? Math.max(16, Math.min(rect.top, innerHeight - height - 16))
          : rect && rect.top >= height + 30
            ? rect.top - height - 18
            : Math.max(
                16,
                Math.min(
                  (rect?.top ?? 0) + (rect?.height ?? 60) + 18,
                  innerHeight - height - 16,
                ),
              ),
    };
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="help-trigger"
        aria-label={
          language === "ko" ? "화면 사용 가이드" : "Start guided tour"
        }
        title={language === "ko" ? "화면 사용 가이드" : "Guided tour"}
        onClick={() => {
          document
            .querySelectorAll<HTMLElement>("[popover]:popover-open")
            .forEach((el) => el.hidePopover());
          setIndex(0);
        }}
      >
        <HelpCircle size={19} />
      </button>
      {current &&
        createPortal(
          <div className="guide-layer">
            <svg
              className="guide-mask"
              width="100%"
              height="100%"
              aria-hidden="true"
            >
              <path
                fill="rgba(12,8,11,.65)"
                fillRule="evenodd"
                d={`M0 0H${innerWidth}V${innerHeight}H0Z ${rect ? `M${rect.left} ${rect.top}v${rect.height}h${rect.width}v-${rect.height}Z` : ""}`}
              />
            </svg>
            {rect ? (
              <>
                <div
                  className="guide-blocker"
                  style={{ left: 0, top: 0, right: 0, height: rect.top }}
                />
                <div
                  className="guide-blocker"
                  style={{
                    left: 0,
                    top: rect.top + rect.height,
                    right: 0,
                    bottom: 0,
                  }}
                />
                <div
                  className="guide-blocker"
                  style={{
                    left: 0,
                    top: rect.top,
                    width: rect.left,
                    height: rect.height,
                  }}
                />
                <div
                  className="guide-blocker"
                  style={{
                    left: rect.left + rect.width,
                    right: 0,
                    top: rect.top,
                    height: rect.height,
                  }}
                />
                <div className="guide-outline" style={rect} />
              </>
            ) : (
              <div className="guide-blocker" style={{ inset: 0 }} />
            )}
            <div
              ref={tip}
              className="guide-tip"
              style={position}
              tabIndex={-1}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
            >
              <div className="guide-tip-top">
                <span>
                  {index! + 1} / {steps.length}
                </span>
                <HelpLanguage />
                <button type="button" className="text-button" onClick={close}>
                  Skip
                </button>
              </div>
              <h2 id={titleId}>{current.title[language]}</h2>
              <p>{current.body[language]}</p>
              {!rect && (
                <p className="help">
                  {language === "ko"
                    ? "현재 화면에서는 이 항목이 표시되지 않습니다. 다음 단계로 이동할 수 있습니다."
                    : "This control is unavailable in the current state. You can continue to the next step."}
                </p>
              )}
              <div className="guide-navigation">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={index === 0}
                  aria-label={language === "ko" ? "이전 단계" : "Previous step"}
                  onClick={() => setIndex(index! - 1)}
                >
                  <ArrowLeft size={17} />
                </button>
                <button
                  type="button"
                  className="btn primary"
                  aria-label={
                    index === steps.length - 1
                      ? language === "ko"
                        ? "가이드 마침"
                        : "Finish guide"
                      : language === "ko"
                        ? "다음 단계"
                        : "Next step"
                  }
                  onClick={() =>
                    index === steps.length - 1 ? close() : setIndex(index! + 1)
                  }
                >
                  {index === steps.length - 1
                    ? language === "ko"
                      ? "마침"
                      : "Finish"
                    : language === "ko"
                      ? "다음"
                      : "Next"}
                  <ArrowRight size={17} />
                </button>
              </div>
              <ManualButton />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
