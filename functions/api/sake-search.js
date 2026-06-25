const TYPES = ['준마이다이긴조', '준마이긴조', '준마이', '다이긴조', '긴조', '혼조조', '니고리', '나마자케', '스파클링', '기타'];
const TEMPS = ['냉주 (차갑게)', '상온', '온주 (데워서)', '무관'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS });

  const url = new URL(request.url);
  let name, image;

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    name = body.name;
    image = body.image;
  } else {
    name = url.searchParams.get('name');
  }

  if (!name && !image) return json({ ok: false, error: 'name required' }, 400);

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'GEMINI_API_KEY가 Cloudflare 환경 변수에 없어요.' }, 500);

  const typeList = TYPES.join(' | ');
  const tempList = TEMPS.join(' | ');
  const schema = `[\n  {\n    "name": "한글/영어 제품명",\n    "nameJa": "일본어 한자/가나",\n    "type": "${typeList} 중 하나",\n    "brewery": "한글 양조장명",\n    "region": "한글 현명 (예: 야마구치현)",\n    "polishing": 정수,\n    "abv": 소수,\n    "temp": "${tempList} 중 하나",\n    "notes": "한국어 2문장 테이스팅 노트"\n  }\n]`;

  const textPrompt = name
    ? `"${name}" 사케(日本酒)의 4~6가지 제품 변형을 찾아주세요.\n순수 JSON 배열만 반환 (마크다운 없이):\n${schema}`
    : `이 사케 라벨을 분석해 브랜드 및 주요 제품 4~6가지를 순수 JSON 배열로 반환하세요:\n${schema}`;

  const parts = [];
  if (image) {
    parts.push({ inline_data: { mime_type: image.mediaType, data: image.data } });
    parts.push({ text: name ? `힌트: "${name}". ` + textPrompt : textPrompt });
  } else {
    parts.push({ text: textPrompt });
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 429) {
        const delay = err.error?.details?.find(d => d.retryDelay)?.retryDelay;
        const sec = delay ? parseInt(delay) : null;
        throw new Error(sec
          ? `요청 한도 초과. ${sec}초 후 다시 시도해주세요.`
          : 'Gemini API 일일 사용량이 초과됐어요. 내일 다시 시도해주세요.');
      }
      throw new Error(err.error?.message || `Gemini API 오류 ${resp.status}`);
    }

    const data = await resp.json();
    const text = (data.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join('');

    if (!text) return json({ ok: false, error: '응답이 비어있습니다.' }, 500);

    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return json({ ok: false, error: '검색 결과를 파싱할 수 없습니다.' }, 500);

    let results;
    try { results = JSON.parse(m[0]); } catch { return json({ ok: false, error: 'JSON 파싱 실패' }, 500); }

    if (!Array.isArray(results) || !results.length) return json({ ok: false, error: '결과를 찾지 못했어요.' }, 404);

    return json({ ok: true, query: name, results });
  } catch (e) {
    return json({ ok: false, error: e.message || '검색 실패' }, 500);
  }
}
