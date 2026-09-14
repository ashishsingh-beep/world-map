# Map Practice

Geography practice: find countries on the map, or name the one highlighted.

```bash
npm install
npm run dev
```

Country data is generated from Natural Earth's **India point-of-view** dataset
(`npm run data`). See CLAUDE.md for why that matters and what not to change.

## Deploy

Cloudflare Pages:
- Build command: `npm run build`
- Output directory: `dist`

Every branch gets a preview at `<branch>.<project>.pages.dev`.
