export type RequestValidation =
  | { usable: true }
  | { usable: false; code: "REQUEST_TOO_SHORT" | "REQUEST_NOT_MEANINGFUL"; reason: string };

/**
 * 자연어 요청이 검색어로 쓸 만한지 미리 거른다.
 *
 * 계약은 `min(1)`뿐이라 "ㅁㄴㅇㄹ", "asdf", "ㅋㅋㅋㅋㅋ" 같은 입력도 그대로 통과했다.
 * 그러면 LLM이 그 문자열로 억지 검색어를 만들고, 엔진은 결과가 안 나올 때까지
 * 재시도를 5번 돌린다. 즉 **의미 없는 입력 하나에 3분과 API 쿼터를 통째로 쓴다.**
 * 여기서 막으면 즉시 실패하고 사용자에게 다시 입력하라고 안내할 수 있다.
 *
 * 판정은 보수적으로 한다. 애매하면 통과시킨다. 정상 요청을 막는 쪽이 훨씬 나쁘다.
 */

const MIN_MEANINGFUL_LENGTH = 2;

/** 완성형 한글(가-힣), 영문, 숫자만 의미 있는 문자로 센다. */
const MEANINGFUL_CHARACTER = /[가-힣a-z0-9]/iu;
/** 완성형이 아닌 한글 낱자. "ㅁ", "ㅋ", "ㅠ" 같은 문자. */
const HANGUL_JAMO = /[ㄱ-ㆎ]/u;
/** 자음/모음만 있는 한글. "ㅁㄴㅇㄹ", "ㅋㅋㅋ", "ㅠㅠ" 같은 입력. */
const HANGUL_JAMO_ONLY = /^[ㄱ-ㆎ\s]+$/u;

/**
 * 낱자가 이 비율을 넘으면 의미 없는 입력으로 본다.
 *
 * 한국어에서 낱자는 그 자체로 뜻을 갖지 않는다. 정상 요청에도 "맛집 추천해줘ㅋㅋ"
 * 처럼 끝에 조금 붙는 정도(10~20%)는 있지만, 그 이상 섞이는 건 써 갈긴 입력이다.
 * 정상 요청을 막는 쪽이 훨씬 나쁘므로 넉넉히 잡는다.
 */
const MAX_JAMO_RATIO = 0.3;

export const validateNaturalLanguageRequest = (request: string): RequestValidation => {
  const trimmed = request.trim();

  if (trimmed.length < MIN_MEANINGFUL_LENGTH) {
    return {
      usable: false,
      code: "REQUEST_TOO_SHORT",
      reason: "요청이 너무 짧아 어떤 장소를 찾아야 할지 알 수 없습니다.",
    };
  }

  if (HANGUL_JAMO_ONLY.test(trimmed)) {
    return {
      usable: false,
      code: "REQUEST_NOT_MEANINGFUL",
      reason: "한글 자음/모음만 있어 의미를 알 수 없습니다.",
    };
  }

  const meaningfulCount = [...trimmed].filter((character) =>
    MEANINGFUL_CHARACTER.test(character),
  ).length;
  if (meaningfulCount < MIN_MEANINGFUL_LENGTH) {
    return {
      usable: false,
      code: "REQUEST_NOT_MEANINGFUL",
      reason: "글자가 아닌 문자로만 이루어져 있습니다.",
    };
  }

  // 낱자가 섞인 입력. 예전에는 **문자열 전체**가 낱자일 때만 걸렀는데, 실제로
  // 써 갈긴 입력은 "ㅁㄴㅇㄹㅁㄴㅇㄹ asdf 1234 ㅋㅋㅋㅋㅋ"처럼 대개 섞여 있다.
  // 그런 입력이 그대로 통과해서 LLM이 "음식점"이라는 억지 검색어를 만들고
  // 파이프라인 전체를 66초 동안 돌렸다.
  const compact = trimmed.replace(/\s/gu, "");
  const jamoCount = [...compact].filter((character) => HANGUL_JAMO.test(character)).length;
  if (compact.length > 0 && jamoCount / compact.length > MAX_JAMO_RATIO) {
    return {
      usable: false,
      code: "REQUEST_NOT_MEANINGFUL",
      reason: "한글 자음/모음이 섞여 있어 의미를 알 수 없습니다.",
    };
  }

  // "ㅋㅋㅋㅋㅋ", "aaaaaa", "!!!!!!" 처럼 한 글자만 반복되는 입력.
  const distinctCharacters = new Set([...compact]).size;
  if (distinctCharacters <= 1) {
    return {
      usable: false,
      code: "REQUEST_NOT_MEANINGFUL",
      reason: "같은 문자만 반복되어 있습니다.",
    };
  }

  return { usable: true };
};
