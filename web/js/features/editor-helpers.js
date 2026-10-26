// Markdown editor helpers: a formatting toolbar, Ctrl+B / Ctrl+I /
// Ctrl+K, Ctrl+Enter to send, a big editor with the preview beside the
// text, and a list of saved drafts in the settings console. The tools
// themselves are components/editor-tools.js, loaded with the editor.

import { later } from '../core/h.js';
import { defineFeature } from './registry.js';

export default defineFeature({
  id: 'editorHelpers',
  name: 'Editor helpers',
  category: 'Comments',
  description: 'A formatting toolbar for the reply and post editors, Ctrl+B / Ctrl+I / Ctrl+K, and a big editor with the preview beside your text. Ctrl+Enter sends.',
  keywords: 'markdown toolbar format bold italic big editor preview drafts',
  options: {
    drafts: { type: 'custom', default: null, label: 'Saved drafts', render: () => later(() => import('../components/editor-tools.js').then((m) => m.draftList())) },
  },
});
