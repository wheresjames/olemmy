// Instances starred on the picker, in the order they were starred. They head
// the picker's list and fill the header's instance menu.

import { persisted } from '../core/store.js';

export const starred = persisted('starredInstances', { version: 1, defaults: { list: [] } });

export const isStarred = (host) => starred.value.list.includes(host);

export function toggleStar(host) {
  starred.update((s) => ({ ...s, list: s.list.includes(host) ? s.list.filter((x) => x !== host) : [...s.list, host] }));
}
