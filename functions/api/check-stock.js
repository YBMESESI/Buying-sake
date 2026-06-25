const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600', ...CORS },
  });
}

function fallbackResults(name) {
  const enc = encodeURIComponent(name);
  return [
    { name: '라쿠텐 (楽天市場)', url: `https://search.rakuten.co.jp/search/mall/${enc}/100505/`, available: null, note: '검색 결과 페이지' },
    { name: 'いまでや', url: `https://shop.imadeya.jp/search?q=${enc}`, available: null, note: '지주 전문점' },
    { name: 'はせがわ酒店', url: `https://hasegawasaketen.com/search?q=${enc}`, available: null, note: '지주 전문점' },
    { name: 'Yahoo!ショッピング', url: `https://shopping.yahoo.co.jp/search?p=${enc}`, available: null, note: '검색 결과 페이지' },
  ];
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name) return json({ error: 'name parameter required' }, 400);

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ name, checkedAt: new Date().toISOString(), results: fallbackResults(name) });
  }

  const prompt = `일본 사케 "${name}"를 온라인에서 구매할 수 있는 일본 사케 전문 쇼핑몰 3~5곳을 알려주세요.

순수 JSON 배열만 반환하세요 (마크다운 없이):
[
  {
    "name": "쇼핑몰 이름 (한국어 또는 일본어)",
    "url": "https://해당-사케-검색-URL",
    "available": true,
    "price": "가격 정보 (알면)",
    "note": "한 줄 메모"
  }
]

규칙:
- url은 반드시 해당 사케를 검색하거나 구매할 수 있는 페이지로
- 矢島地酒店, いまでや, はせがわ酒店, 君嶋屋, 升本, 酒のやまや 같은 전문점 우선
- available: true=재고있음, false=품절, null=확인불가`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(25000),
      }
    );

    if (!resp.ok) throw new Error(`Gemini API 오류 ${resp.status}`);

    const data = await resp.json();
    const text = (data.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join('');
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('결과 파싱 실패');

    const results = JSON.parse(m[0]);
    if (!Array.isArray(results) || !results.length) throw new Error('결과 없음');

    return json({ name, checkedAt: new Date().toISOString(), results });
  } catch (e) {
    return json({ name, checkedAt: new Date().toISOString(), error: e.message, results: fallbackResults(name) });
  }
}
