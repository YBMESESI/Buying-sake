const TYPES = ['준마이다이긴조', '준마이긴조', '준마이', '다이긴조', '긴조', '혼조조', '니고리', '나마자케', '스파클링', '기타'];
const TEMPS = ['냉주 (차갑게)', '상온', '온주 (데워서)', '무관'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const name = req.query?.name || req.body?.name;
  const image = req.body?.image;
  if (!name && !image) return res.status(400).json({ ok: false, error: 'name required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'GEMINI_API_KEY가 .env.local에 없어요.' });

  const typeList = TYPES.join(' | ');
  const tempList = TEMPS.join(' | ');

  const jsonSchema = `[\n  {\n    "name": "한글 또는 영어 제품명",\n    "nameJa": "일본어 한자/가나 표기",\n    "type": "${typeList} 중 하나",\n    "brewery": "한글 양조장명 (예: 아사히 주조)",\n    "region": "한글 현명 (예: 야마구치현)",\n    "polishing": 정수,\n    "abv": 소수,\n    "temp": "${tempList} 중 하나",\n    "notes": "한국어 2문장 테이스팅 노트"\n  }\n]`;

  const textPrompt = name
    ? `"${name}" 사케(日本酒)를 검색해서 이 브랜드의 4~6가지 구체적인 제품 변형을 찾아주세요.\n\n순수 JSON 배열만 반환하세요 (마크다운 코드블록 없이):\n${jsonSchema}`
    : `이 사케 라벨 이미지를 분석해서 브랜드를 식별하고 주요 제품 4~6가지를 찾아 아래 형식의 순수 JSON 배열로 반환하세요:\n${jsonSchema}`;

  try {
    const parts = [];
    if (image) {
      parts.push({ inline_data: { mime_type: image.mediaType, data: image.data } });
      parts.push({ text: name ? `사케 이름 힌트: "${name}". ` + textPrompt : textPrompt });
    } else {
      parts.push({ text: textPrompt });
    }

    const reqBody = {
      contents: [{ parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      if (resp.status === 429) {
        const delay = err.error?.details?.find(d => d.retryDelay)?.retryDelay;
        const sec = delay ? parseInt(delay) : null;
        throw new Error(sec
          ? `Gemini API 요청 한도 초과. ${sec}초 후 다시 시도해주세요.`
          : 'Gemini API 일일 무료 사용량이 초과됐어요. 내일 다시 시도하거나 Google Cloud에서 결제를 활성화해주세요.');
      }
      throw new Error(err.error?.message || `Gemini API 오류 ${resp.status}`);
    }

    const data = await resp.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .filter(p => p.text)
      .map(p => p.text)
      .join('');

    if (!text) return res.status(500).json({ ok: false, error: '응답이 비어있습니다.' });

    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return res.status(500).json({ ok: false, error: '검색 결과를 파싱할 수 없습니다.' });

    let results;
    try { results = JSON.parse(m[0]); } catch {
      return res.status(500).json({ ok: false, error: 'JSON 파싱 실패' });
    }

    if (!Array.isArray(results) || !results.length) {
      return res.status(404).json({ ok: false, error: '일치하는 사케를 찾지 못했어요.' });
    }

    res.json({ ok: true, query: name, results });
  } catch (e) {
    console.error('sake-search error:', e);
    const msg = (e.message?.includes('API_KEY') || e.message?.includes('401') || e.message?.includes('403'))
      ? 'GEMINI_API_KEY가 올바르지 않아요. .env.local을 확인해주세요.'
      : (e.message || '검색 실패');
    res.status(500).json({ ok: false, error: msg });
  }
}
