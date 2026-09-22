import type { WirelessEndpoint } from "@/lib/adb/wireless";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

interface WirelessState {
	endpoints: Record<string, WirelessEndpoint>;
}

interface WirelessActions {
	addEndpoint: (endpoint: WirelessEndpoint) => void;
	removeEndpoint: (serial: string) => void;
}

type WirelessStore = WirelessState & WirelessActions;

interface LegacyWirelessState {
	lastEndpoint?: WirelessEndpoint | null;
}

export const useWirelessStore = create<WirelessStore>()(
	persist(
		(set) => ({
			endpoints: {},

			addEndpoint: (endpoint) =>
				set((s) => ({
					endpoints: { ...s.endpoints, [endpoint.serial]: endpoint },
				})),

			removeEndpoint: (serial) =>
				set((s) => {
					const { [serial]: _removed, ...endpoints } = s.endpoints;
					return { endpoints };
				}),
		}),
		{
			name: "openportal-wireless",
			version: 1,
			migrate: (persisted, version) => {
				if (version === 0) {
					const legacy = persisted as LegacyWirelessState;
					const endpoint = legacy?.lastEndpoint;
					return {
						endpoints: endpoint ? { [endpoint.serial]: endpoint } : {},
					} satisfies WirelessState;
				}
				return persisted as WirelessState;
			},
		},
	),
);

export function useWirelessEndpoints(): WirelessEndpoint[] {
	return useWirelessStore(useShallow((s) => Object.values(s.endpoints)));
}

// The guided single-device connect flow (pre-fleet-UI) surfaces only the
// most recently paired endpoint; browsing the full set is the fleet
// reconnect wall.
export function useLatestEndpoint(): WirelessEndpoint | null {
	return useWirelessStore((s) => {
		const values = Object.values(s.endpoints);
		return values.length > 0 ? (values[values.length - 1] ?? null) : null;
	});
}

export function getWirelessEndpoints(): WirelessEndpoint[] {
	return Object.values(useWirelessStore.getState().endpoints);
}
