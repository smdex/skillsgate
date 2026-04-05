import type { ReactNode } from "react";

/**
 * Placeholder provider wrapper.
 * Previously supplied the @skillsgate/ui PublicApiClientProvider;
 * that dependency was removed with the backend. Kept as a pass-through
 * so the root layout import stays valid.
 */
export function UIProviders({ children }: { children: ReactNode }) {
	return <>{children}</>;
}
