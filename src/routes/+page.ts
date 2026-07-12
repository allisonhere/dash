import { redirect } from '@sveltejs/kit';

// The overview page is gone; bookmarks is the landing page.
export const load = () => {
	redirect(307, '/bookmarks');
};
