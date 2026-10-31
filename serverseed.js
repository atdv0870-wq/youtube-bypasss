require('dotenv').config();
const db = require('./db');

const SAMPLE = 'https://storage.googleapis.com/gtv-videos-bucket/sample';
const thumb = (s) => `https://picsum.photos/seed/${s}/640/360`;

const categories = [
  ['amateur', 'Amateur'], ['anal', 'Anal'], ['asian', 'Asian'],
  ['bbw', 'BBW'], ['lesbian', 'Lesbian'], ['milf', 'MILF'],
  ['pov', 'POV'], ['teen-18', '18+ Teens'], ['vintage', 'Vintage']
];

const videos = [
  ['Midnight Motel Room Service', 'amateur', 'ForBiggerBlazes', 15, 0],
  ['Sunset Balcony Session', 'pov', 'ForBiggerEscapes', 15, 0],
  ['Two Roommates, One Bed', 'lesbian', 'ForBiggerFun', 60, 1],
  ['Studio Casting, Take 4', 'amateur', 'ForBiggerJoyrides', 15, 0],
  ['Morning Coffee & Nothing Else', 'milf', 'ForBiggerMeltdowns', 15, 0],
  ['Neon Tokyo Apartment', 'asian', 'BigBuckBunny', 596, 0],
  ['Backseat Detour', 'teen-18', 'SubaruOutbackOnStreetAndDirt', 594, 0],
  ['The Long Weekend', 'pov', 'ElephantsDream', 653, 1],
  ['VHS Summer of 94', 'vintage', 'Sintel', 888, 0],
  ['Garage Workshop Break', 'bbw', 'VolkswagenGTIReview', 419, 0],
  ['Hotel Suite, 3AM', 'anal', 'TearsOfSteel', 734, 1],
  ['Rooftop Pool Afterparty', 'lesbian', 'WeAreGoingOnBullrun', 472, 0],
  ['First Time On Camera', 'teen-18', 'WhatCarCanYouGetForAGrand', 639, 0]
];

const tags = ['hd', '4k', 'brunette', 'blonde', 'natural', 'big-tits', 'creampie', 'outdoor', 'homemade', 'solo'];

const insCat = db.prepare('INSERT OR IGNORE INTO categories (slug, name) VALUES (?, ?)');
const insTag = db.prepare('INSERT OR IGNORE INTO tags (slug, name) VALUES (?, ?)');
const insVid = db.prepare(`
  INSERT OR IGNORE INTO videos
  (title, slug, description, category_id, thumbnail, preview, video_url, duration, views, likes, is_premium)
  VALUES (@title, @slug, @description, @category_id, @thumbnail, @preview, @video_url, @duration, @views, @likes, @is_premium)
`);
const linkTag = db.prepare('INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)');

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const tx = db.transaction(() => {
  categories.forEach(([s, n]) => insCat.run(s, n));
  tags.forEach((t) => insTag.run(t, t));

  videos.forEach(([title, cat, file, duration, premium], i) => {
    const catId = db.prepare('SELECT id FROM categories WHERE slug = ?').get(cat).id;
    const info = insVid.run({
      title,
      slug: `${slug(title)}-${i + 1}`,
      description: `${title} — full scene in 1080p.`,
      category_id: catId,
      thumbnail: thumb(`${slug(title)}-${i}`),
      preview: `${SAMPLE}/${file}.mp4`,
      video_url: `${SAMPLE}/${file}.mp4`,
      duration,
      views: Math.floor(Math.random() * 480000) + 1200,
      likes: Math.floor(Math.random() * 9000),
      is_premium: premium
    });
    if (info.changes) {
      const vid = info.lastInsertRowid;
      const picks = new Set([tags[i % tags.length], tags[(i * 3 + 1) % tags.length]]);
      picks.forEach((t) => {
        const tagId = db.prepare('SELECT id FROM tags WHERE slug = ?').get(t).id;
        linkTag.run(vid, tagId);
      });
    }
  });
});

tx();
console.log('Seeded categories, tags and videos.');