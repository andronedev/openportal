import type { WirelessEndpoint } from "@/lib/adb/wireless";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WirelessStore {
	lastEndpoint: WirelessEndpoint | null;
	setEndpoint: (endpoint: WirelessEndpoint | null) => void;
}

export const useWirelessStore = create<WirelessStore>()(
	persist(
		(set) => ({
			lastEndpoint: null,
			setEndpoint: (lastEndpoint) => set({ lastEndpoint }),
		}),
		{
			name: "openportal-wireless",
		},
	),
);
