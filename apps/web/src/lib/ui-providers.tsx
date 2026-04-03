import { useMemo, type ReactNode } from "react";
import {
	PublicApiClientProvider,
	createPublicApiClient,
} from "@skillsgate/ui";

const API_BASE_URL = "https://api.skillsgate.ai";

/**
 * Wraps children with the public API client provider.
 * Place this inside the root layout so all pages can use shared components.
 */
export function UIProviders({ children }: { children: ReactNode }) {
	const publicApiClient = useMemo(
		() => createPublicApiClient({ baseUrl: API_BASE_URL }),
		[],
	);

	return (
		<PublicApiClientProvider value={publicApiClient}>
			{children}
		</PublicApiClientProvider>
	);
}
