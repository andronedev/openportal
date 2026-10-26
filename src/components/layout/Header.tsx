import { ConnectButton } from "@/components/connection/ConnectButton";
import { ConnectionStatus } from "@/components/connection/ConnectionStatus";
import { Menu } from "lucide-react";
import { GithubTokenButton } from "./GithubTokenButton";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ModeToggle } from "./ModeToggle";

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
	return (
		<header className="flex h-14 items-center gap-3 border-b border-border px-4 md:px-6">
			<button
				type="button"
				onClick={onMenuClick}
				className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
				aria-label="Menu"
			>
				<Menu className="h-5 w-5" />
			</button>
			<ConnectionStatus />
			<div className="ml-auto flex items-center gap-2 md:gap-3">
				<ConnectButton />
				<GithubTokenButton />
				<LanguageSwitcher />
				<ModeToggle />
			</div>
		</header>
	);
}
