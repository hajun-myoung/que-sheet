import { ShieldCheck } from "lucide-react";

export default function Footer() {
  return (
    <footer className="page-footer">
      <span>
        The Q · Copyright @TheQ, 2026, All Rights Reserved | 본 사이트 및 내부
        자료에 대한 무단 복제, 수정 및 2차 재배포를 엄격하게 금지합니다
      </span>
      <span>
        <ShieldCheck size={13} />
        제출하신 발표자료는 데이터베이스에 안전하게 보관됩니다!
      </span>
    </footer>
  );
}
