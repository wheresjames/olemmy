// #/errors: the error log (core/errors.js), newest first, with the report
// to copy or share and a way to clear it. Opening it marks the errors seen,
// which hides the header's warning icon. Works before an instance is chosen.

import { h } from '../core/h.js';
import { signal, onCleanup } from '../core/signal.js';
import { href } from '../core/router.js';
import { errorLog, errorReport, onErrors, markErrorsSeen, unseenErrors, clearErrors } from '../core/errors.js';
import { setTitle, empty, timeEl } from '../components/common.js';
import { copyText, canShare, shareText } from '../components/send-link.js';
import { confirmAction } from '../components/dialog.js';
import { toast } from '../components/toast.js';

function entry(e) {
  return h('li.error-entry',
    h('p.error-message', h('strong', e.message), e.count > 1 && h('span.error-count', ` ×${e.count}`)),
    h('p.small.error-where',
      timeEl(e.last), e.count > 1 && [' (first ', timeEl(e.time), ')'],
      e.where && ` · ${e.where}`,
      ' · on ', h('a', { href: e.page }, e.page)),
    e.stack && h('details.error-stack', h('summary', 'details'), h('pre', e.stack)));
}

export function errorsView(route, { chrome }) {
  setTitle('errors');
  chrome.pageName.value = { text: 'errors', href: href('/errors') };
  chrome.tabs.value = null;
  chrome.sidebar.value = null;

  // Seen while this is open, new ones included.
  const changed = signal(0);
  markErrorsSeen();
  onCleanup(onErrors(() => {
    if (unseenErrors()) markErrorsSeen();
    changed.value++;
  }));

  const copy = async () => toast(await copyText(errorReport()) ? 'Error report copied' : 'Couldn\'t copy: select the report below instead', { kind: 'success' });
  const share = async () => { if (!await shareText(errorReport(), 'Olemmy error report')) copy(); };
  const clear = async () => {
    if (await confirmAction('Clear the error log?', 'The errors listed here are forgotten.', 'Clear')) clearErrors();
  };

  return h('div.errors-page',
    h('h1', 'Errors'),
    h('p.errors-intro', 'Unexpected errors in Olemmy, kept in this browser (the latest 50). To report one, copy or share the report and send it to whoever looks after this copy of Olemmy. Problems with your instance or your connection have messages of their own where they happen, and aren\'t listed here.'),
    () => {
      changed.value;
      const log = errorLog();
      if (!log.length) return empty('No errors. If something looks wrong anyway, refreshing the app often helps.');
      return [
        h('div.errors-actions',
          h('button.btn.btn-primary', { type: 'button', onclick: copy }, 'copy report'),
          canShare() && h('button.btn', { type: 'button', onclick: share }, 'share report'),
          h('button.btn', { type: 'button', onclick: clear }, 'clear')),
        h('ol.errors-list', log.map(entry)),
        h('details.errors-report', h('summary', 'the report as text'), h('pre', errorReport())),
      ];
    },
    h('p.small.errors-help', 'Olemmy misbehaving? ', h('a', { href: 'reset.html' }, 'Refresh the app'), ': it fetches every file again and keeps your settings.'));
}
