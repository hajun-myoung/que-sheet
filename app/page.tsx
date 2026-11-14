import { HelpProvider } from "@/components/help";
import { ConfirmProvider } from "@/components/confirm";
import { Workspace } from "@/components/workspace";
export default function Page() {
  return (
    <HelpProvider>
      <ConfirmProvider>
        <Workspace />
      </ConfirmProvider>
    </HelpProvider>
  );
}
