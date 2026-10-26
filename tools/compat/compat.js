// Browser half of the compatibility check (scripts/compat.mjs is the Node half).
// A fetch that CORS refuses rejects with a TypeError; one it allows resolves,
// whatever its status. So "readable" below is simply "the promise resolved".

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));

async function readable(url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    return { ok: true, status: res.status, res };
  } catch (e) {
    return { ok: false, status: e.name === 'TimeoutError' ? 'timeout' : 'blocked' };
  }
}

function cell(row, check) {
  const td = row.insertCell();
  td.textContent = check.ok ? `yes (${check.status})` : `no (${check.status})`;
  td.className = check.ok ? 'yes' : 'no';
}

async function probe(host, tbody) {
  const base = `https://${host}`;
  const row = tbody.insertRow();
  row.insertCell().textContent = host;
  const version = row.insertCell();

  const site = await readable(`${base}/api/v3/site`);
  version.textContent = site.ok ? (await site.res.json().catch(() => ({}))).version || '?' : '?';
  cell(row, site);
  cell(row, await readable(`${base}/api/v3/user/unread_count`, {
    headers: { Authorization: 'Bearer olemmy-compat-check' },
  }));
  const form = new FormData();
  form.append('images[]', new Blob([PNG], { type: 'image/png' }), 'pixel.png');
  cell(row, await readable(`${base}/pictrs/image`, {
    method: 'POST', body: form, headers: { Authorization: 'Bearer olemmy-compat-check' },
  }));
  const v4 = await readable(`${base}/api/v4/site`);
  cell(row, { ok: v4.ok && v4.status === 200, status: v4.status });
}

document.getElementById('run').addEventListener('click', async () => {
  const tbody = document.getElementById('rows');
  const state = document.getElementById('state');
  tbody.replaceChildren();
  const hosts = document.getElementById('hosts').value.split(/\s+/).filter(Boolean);
  state.textContent = 'Running…';
  for (const host of hosts) await probe(host, tbody);
  state.textContent = `Done: ${hosts.length} instances, from origin ${location.origin}.`;
});
