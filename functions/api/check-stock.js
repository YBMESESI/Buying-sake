// 실제 검색 URL이 확인된 니혼슈 전문판매점만 포함
const SHOPS = [
  {
    name: 'いまでや',
    url: q => `https://imadeya.co.jp/search?q=${q}&type=product`,
    note: '지주 전문점 · 전국 배송',
  },
  {
    name: 'はせがわ酒店',
    url: q => `https://www.hasegawasaketen.com/eshop/products/list?name=${q}`,
    note: '지주 전문점 · 1914년 창업',
  },
  {
    name: 'SAKETIME',
    url: q => `https://saketime.jp/search?q=${q}`,
    note: '일본 최대 사케 정보 · 구매처 연동',
  },
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name) return new Response(JSON.stringify({ error: 'name parameter required' }), {
    status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
  });

  const q = encodeURIComponent(name);
  const results = SHOPS.map(s => ({
    name: s.name,
    url: s.url(q),
    available: null,
    note: s.note,
  }));

  return new Response(JSON.stringify({ name, checkedAt: new Date().toISOString(), results }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600', ...CORS },
  });
}
