module.exports = (req, res) => {
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=86400');
  res.status(200).send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://brinkberry.com/sitemap.xml
`);
};
