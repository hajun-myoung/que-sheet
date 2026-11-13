import { ConfirmProvider } from "@/components/confirm";
import { Workspace } from "@/components/workspace";
export default function Page() {
  return (
    <ConfirmProvider>
      <Workspace />
    </ConfirmProvider>
  );
}
