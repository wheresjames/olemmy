// Places where feature modules add to views, without the features
// importing the views (which load on demand).

/** (community) => Node: extra pieces for a community page's sidebar. */
export const communitySideHooks = [];

/** () => Node: extra buttons in a listing's toolbar. */
export const listingToolbarHooks = [];

/** (post, ctx) => Node[]: moderator buttons for a post row. */
export const postModHooks = [];

/** (comment, ctx) => Node[]: moderator buttons for a comment. */
export const commentModHooks = [];
