import { readFileSync, writeFileSync } from 'node:fs'
import { geoEquirectangular, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'

const topo = JSON.parse(readFileSync('src/data/countries.topo.json', 'utf8'))
const meta = JSON.parse(readFileSync('src/data/countries.meta.json', 'utf8'))
const fc = feature(topo, topo.objects.countries)
const W = 900, H = 620
const proj = geoEquirectangular().fitExtent([[10,10],[W-10,H-10]], {
  type:'MultiPoint', coordinates:[[64,20],[64,40],[100,40],[100,20]]
})
const path = geoPath(proj)
const show = ['IND','PAK','CHN','NPL','BTN','BGD','AFG','MMR','LKA','TJK']
const parts = fc.features.filter(f => show.includes(f.properties.iso)).map(f => {
  const iso = f.properties.iso
  const fill = iso === 'IND' ? '#ff9933' : '#f0efd8'
  return `<path d="${path(f)}" fill="${fill}" stroke="#1f2d4d" stroke-width="1"/>`
}).join('\n')
const labels = show.map(iso => {
  const [x,y] = proj(meta[iso].centroid)
  if (!Number.isFinite(x)) return ''
  const big = iso === 'IND'
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${big?20:13}" font-weight="700" fill="${big?'#1f2d4d':'#64748b'}">${meta[iso].name}</text>`
}).join('\n')
writeFileSync('shots/india-borders.svg',
`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#22cdfb"/>
${parts}
${labels}
<text x="16" y="${H-16}" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="#1f2d4d">India as rendered — Natural Earth India point-of-view</text>
</svg>`)
console.log('wrote shots/india-borders.svg')
