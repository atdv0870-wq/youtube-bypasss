require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const PAGE_SIZE = 24;

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(morgan('tiny'));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

const limiter = rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);

const SORTS = {
  recent: 'v.published_at DESC',
  popular: 'v.views DESC',
  liked: 'v.likes DESC',
  longest: 'v.duration DESC'
};

const SELECT = `
  SELECT v.id, v.title, v.slug, v.description, v.thumbnail, v.preview, v.video_url,
         v.duration, v.views, v.likes, v.is_premium, v.published_at,
         c.slug AS category, c.name AS category_name
  FROM videos v
  LEFT JOIN categories c ON c.id = v.category_id
`;

const withTags = db.prepare(`SELECT t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id WHERE vt.video_id = ?`);
const hydrate = (row) => ({ ...row, tags: withTags.all(row.id).map((t) => t.name) });

app.get('/api/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.slug, c.name, COUNT(v.id) AS count
    FROM categories c LEFT JOIN videos v ON v.category_id = c.id
    GROUP BY c.id ORDER BY c.name
  `).all();
  res.json(rows);
});

app.get('/api/tags', (req, res) => {
  res.json(db.prepare(`
    SELECT t.slug, t.name, COUNT(vt.video_id) AS count
    FROM tags t JOIN video_tags vt ON vt.tag_id = t.id
    GROUP BY t.id ORDER BY count DESC LIMIT 30
  `).all());
});

app.get('/api/videos', (req, res) => {
  const { q, category, tag, sort = 'recent' } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = [];
  const params = {};

  if (q) {
    where.push('(v.title LIKE @q OR v.description LIKE @q)');
    params.q = `%${q}%`;
  }
  if (category) {
    where.push('c.slug = @category');
    params.category = category;
  }
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM video_tags vt JOIN tags t ON t.id = vt.tag_id WHERE vt.video_id = v.id AND t.slug = @tag)');
    params.tag = tag;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = SORTS[sort] || SORTS.recent;

  const total = db.prepare(`SELECT COUNT(*) AS n FROM videos v LEFT JOIN categories c ON c.id = v.category_id ${whereSql}`).get(params).n;
  const rows = db.prepare(`${SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

  res.json({
    data: rows.map(hydrate),
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore: page * PAGE_SIZE < total
  });
});

app.get('/api/videos/:slug', (req, res) => {
  const row = db.prepare(`${SELECT} WHERE v.slug = ?`).get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(hydrate(row));
});

app.post('/api/videos/:id/view', (req, res) => {
  const info = db.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: info.changes > 0 });
});

app.post('/api/videos/:id/like', (req, res) => {
  const row = db.prepare('UPDATE videos SET likes = likes + 1 WHERE id = ? RETURNING likes').get(req.params.id);
  res.json(row || { error: 'Not found' });
});

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));