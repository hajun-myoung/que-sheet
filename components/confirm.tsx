"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
type Ask = (message: string) => Promise<boolean>;
const Context = createContext<Ask>(async () => false);
export const useConfirm = () => useContext(Context);
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const resolve = useRef<((value: boolean) => void) | null>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const ask: Ask = (text) =>
    new Promise((done) => {
      resolve.current?.(false);
      resolve.current = done;
      setMessage(text);
    });
  const finish = (value: boolean) => {
    dialog.current?.close();
    setMessage("");
    resolve.current?.(value);
    resolve.current = null;
  };
  useEffect(() => {
    if (message) dialog.current?.showModal();
  }, [message]);
  return (
    <Context.Provider value={ask}>
      {children}
      <dialog
        ref={dialog}
        className="confirm-dialog"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onCancel={() => finish(false)}
      >
        <h2 id="confirm-title">진행하기 전에 확인해 주세요</h2>
        <p id="confirm-message">{message}</p>
        <div className="button-row">
          <button
            className="btn secondary"
            autoFocus
            onClick={() => finish(false)}
          >
            취소
          </button>
          <button className="btn primary" onClick={() => finish(true)}>
            확인하고 진행
          </button>
        </div>
      </dialog>
    </Context.Provider>
  );
}
