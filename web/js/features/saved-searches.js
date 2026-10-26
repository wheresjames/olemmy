// Saved searches (Tier 3): keep a search (terms, type, community, sort) to
// run again from the search page's sidebar. olemmy:searches. The store
// and UI are impl/saved-searches.js, loaded with the search page.

import { defineFeature } from './registry.js';

export default defineFeature({
  id: 'savedSearches',
  name: 'Saved searches',
  category: 'Browsing',
  description: 'Save searches to run again from the search page\'s sidebar.',
  keywords: 'search save saved query bookmark',
});
