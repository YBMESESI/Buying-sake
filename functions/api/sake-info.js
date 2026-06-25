const TYPES = ['준마이다이긴조', '준마이긴조', '준마이', '다이긴조', '긴조', '혼조조', '니고리', '나마자케', '스파클링', '기타'];
const TEMPS = ['냉주 (차갑게)', '상온', '온주 (데워서)', '무관'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  const { name, image } = await request.json().catch(() => ({}));
  if (!name && !image) return json({ ok: false, error: 'name or image required' }, 400);

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return json({ ok: false, error: 'GEMINI_API_KEY가 설정되지 않았어요.' }, 500);

  const prompt = name
    ? `사케 "${name}"의 정보를 JSON으로 반환해주세요. 순수 JSON만, 마크다운 없이:\n{\n  "name": "한글/영어 제품명",\n  "nameJa": "일본어 한자/가나",\n  "type": "${TYPES.join(' | ')} 중 하나",\n  "brewery": "한글 양조장명",\n  "region": "한글 현명",\n  "polishing": 정수,\n  "abv": 소수,\n  "temp": "${TEMPS.join(' | ')} 중 하나",\n  "notes": "한국어 2~3문장 테이스팅 노트"\n}`
    : `이 사케 라벨 이미지를 분석해서 사케 정보를 JSON으로 반환해주세요. 순수 JSON만:\n{\n  "name": "한글/영어 제품명",\n  "nameJa": "일본어 한자/가나",\n  "type": "${TYPES.join(' | ')} 중 하나",\n  "brewery": "한글 양조장명",\n  "region": "한글 현명",\n  "polishing": 정수,\n  "abv": 소수,\n  "temp": "${TEMPS.join(' | ')} 중 하나",\n  "notes": "한국어 2~3문장 테이스팅 노트"\n}`;

  const parts = [];
  if (image) {
    parts.push({ inline_data: { mime_type: image.mediaType, data: image.data } });
    parts.push({ text: name ? `힌트: "${name}". ` + prompt : prompt });
  } else {
    parts.push({ text: prompt });
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 1024 } }),
        signal: AbortSignal.timeout(25000),
      }
    );

    if (!resp.ok) throw new Error(`Gemini API 오류 ${resp.status}`);

    const data = await resp.json();
    const text = (data.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('응답 파싱 실패');

    return json({ ok: true, data: JSON.parse(m[0]) });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
