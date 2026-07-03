import { resolveTheme } from '$lib/server/theme-selection';

export const load = ({ depends }: { depends: (dep: string) => void }) => {
	depends('omarchy:theme');

	const resolved = resolveTheme();

	return {
		theme: resolved.theme,
		selection: resolved.selection,
		omarchyAvailable: resolved.omarchyAvailable,
		builtins: resolved.builtins
	};
};
