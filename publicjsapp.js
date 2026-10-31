(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const grid = $('#grid');
  const chips = $('#chips');
  const countEl = $('#count');
  const emptyEl = $('#empty');
  const sentinel = $('#sentinel');
  const player = $('#player');
  const video = $('#video');

  const state = { q: '', category: '', sort: 'recent', page: 0, hasMore: true, loading: false, total: 0 };

  /* ---------- age gate ---------- */
  const gate = $('#agegate');
  if (localStorage.getItem('ageOk') === '1') gate.hidden = true;
  else gate.hidden = false;
  gate.addEventListener('click', (e) => {
    const b = e.target.closest('[data-age]');
    if (!b) return;
    if (b.dataset.age === 'yes') {
      localStorage.setItem('ageOk', '1');
      gate.hidden = true;
    } else {
      location.href = 'https://www.google.com';
    }
  });

  /* ---------- helpers ---------- */
  const fmtDur = (s) => {
    const m = Math.floor(s / 60), r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  };
  const fmtViews = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M`
    : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- categories ---------- */
  fetch('/api/categories').then((r) => r.json()).then((rows) => {
    rows.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.cat = c.slug;
      b.textContent = `${c.name} (${c.count})`;
      chips.append(b);
    });
  }).catch(() => {});

  chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === b));
    state.category = b.dataset.cat;
    load(true);
  });

  /* ---------- search + sort ---------- */
  let t;
  $('#search').addEventListener('submit', (e) => e.preventDefault());
  $('#q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim(); load(true); }, 300);
  });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; load(true); });

  /* ---------- load ---------- */
  async function load(reset = false) {
    if (state.loading) return;
    if (reset) { state.page = 0; state.hasMore = true; grid.innerHTML = ''; }
    if (!state.hasMore) return;

    state.loading = true;
    state.page += 1;

    const params = new URLSearchParams({
      page: state.page, sort: state.sort,
      ...(state.q && { q: state.q }),
      ...(state.category && { category: state.category })
    });

    try {
      const res = await fetch(`/api/videos?${params}`);
      const json = await res.json();
      state.total = json.total;
      state.hasMore = json.hasMore;

      countEl.textContent = json.total
        ? `${json.total.toLocaleString()} videos`
        : '0 videos';

      emptyEl.hidden = json.total > 0;
      json.data.forEach(renderCard);
    } catch {
      countEl.textContent = 'Connection error';
    } finally {
      state.loading = false;
    }
  }

  function renderCard(v) {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card__thumb" data-slug="${esc(v.slug)}" data-id="${v.id}">
        <img src="${esc(v.thumbnail)}" alt="${esc(v.title)}" loading="lazy" width="640" height="360">
        <span class="card__dur">${fmtDur(v.duration)}</span>
        ${v.is_premium ? '<span class="card__badge">Premium</span>' : ''}
      </div>
      <div class="card__body">
        <h3 class="card__title">${esc(v.title)}</h3>
        <div class="card__meta">
          <span>${esc(v.category_name || 'Uncategorized')}</span>
          <span>${fmtViews(v.views)} views</span>
        </div>
      </div>`;
    grid.append(card);
  }

  /* ---------- infinite scroll ---------- */
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !state.loading && state.hasMore) load();
  }, { rootMargin: '600px' }).observe(sentinel);

  /* ---------- player ---------- */
  grid.addEventListener('click', async (e) => {
    const thumb = e.target.closest('.card__thumb');
    if (!thumb) return;
    await open(thumb.dataset.slug, Number(thumb.dataset.id));
  });

  let currentId = null;

  async function open(slug, id) {
    const res = await fetch(`/api/videos/${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const v = await res.json();

    currentId = v.id;
    $('#pTitle').textContent = v.title;
    $('#pStats').textContent = `${fmtViews(v.views)} views · ${fmtViews(v.likes)} likes · ${fmtDur(v.duration)}`;
    $('#pTags').innerHTML = v.tags.map((t) => `<span>${esc(t)}</span>`).join('');
    $('#downloadBtn').href = v.video_url;

    video.src = v.video_url;
    player.hidden = false;
    document.body.style.overflow = 'hidden';
    video.play().catch(() => {});
    fetch(`/api/videos/${id}/view`, { method: 'POST' }).catch(() => {});
  }

  function close() {
    player.hidden = true;
    video.pause();
    video.removeAttribute('src');
    video.load();
    document.body.style.overflow = '';
    currentId = null;
  }

  player.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !player.hidden) close(); });

  $('#likeBtn').addEventListener('click', async () => {
    if (!currentId) return;
    await fetch(`/api/videos/${currentId}/like`, { method: 'POST' }).catch(() => {});
    $('#likeBtn').textContent = '? Liked';
  });

  /* ---------- boot ---------- */
  $('#year').textContent = new Date().getFullYear();
  const pre = new URLSearchParams(location.search);
  if (pre.get('sort')) { state.sort = pre.get('sort'); $('#sort').value = state.sort; }
  load(true);
})();