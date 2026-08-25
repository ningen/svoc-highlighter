(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SVOCParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.7.0';
  const DETERMINERS = new Set('a an the this that these those my your his her its our their each every either neither some any no another such all both few many much several enough'.split(' '));
  const PRONOUNS = new Set('i you he she it we they me him her us them who whom whose which what this that these those'.split(' '));
  const POSSESSIVES = new Set('my your his her its our their whose'.split(' '));
  const PREPOSITIONS = new Set('about above across after against along among around as at before behind below beneath beside between beyond by despite during except for from in inside into like near of off on onto over past per since through throughout to toward towards under underneath until up upon via with within without'.split(' '));
  const COORD = new Set('and but or nor yet so'.split(' '));
  const SUBORD = new Set('although because before even if once since though unless until when whenever where whereas wherever whether while'.split(' '));
  const RELATIVE = new Set('that which who whom whose what'.split(' '));
  const MODALS = new Set('can could may might must shall should will would'.split(' '));
  const BE = new Set('am is are was were be been being'.split(' '));
  const HAVE = new Set('have has had having'.split(' '));
  const DO = new Set('do does did doing done'.split(' '));
  const AUX = new Set([...MODALS, ...BE, ...HAVE, ...DO]);
  const NEG_ADVERBS = new Set('not never also just only already still often usually generally typically normally commonly directly automatically simply'.split(' '));
  const LINKING = new Set('am is are was were be been being become becomes became seem seems seemed remain remains remained appear appears appeared feel feels felt look looks looked sound sounds sounded smell smells smelled taste tastes tasted grow grows grew turn turns turned prove proves proved'.split(' '));

  // Frequent lexical verbs in technical documentation. Base/inflected forms are intentionally explicit
  // to avoid classifying plural nouns ending in -s as verbs.
  const VERBS = new Set(`accept accepts accepted accepting add adds added adding allow allows allowed allowing apply applies applied applying
    build builds built building bundle bundles bundled bundling call calls called calling change changes changed changing check checks checked checking choose chooses chose chosen choosing
    compare compares compared comparing compute computes computed computing configure configures configured configuring customise customises customised customising customize customizes customized customizing clear clears cleared clearing connect connects connected connecting
    contain contains contained containing convert converts converted converting create creates created creating define defines defined defining delete deletes deleted deleting
    depend depends depended depending describe describes described describing determine determines determined determining disable disables disabled disabling display displays displayed displaying
    enable enables enabled enabling ensure ensures ensured ensuring execute executes executed executing expose exposes exposed exposing fetch fetches fetched fetching find finds found finding
    generate generates generated generating get gets got gotten getting handle handles handled handling include includes included including initialize initializes initialized initializing instruct instructs instructed instructing
    install installs installed installing invoke invokes invoked invoking load loads loaded loading make makes made making map maps mapped mapping match matches matched matching
    merge merges merged merging modify modifies modified modifying open opens opened opening opt opts opted opting parse parses parsed parsing pass passes passed passing prevent prevents prevented preventing
    process processes processed processing provide provides provided providing read reads reading receive receives received receiving reduce reduces reduced reducing register registers registered registering
    remove removes removed removing render renders rendered rendering replace replaces replaced replacing represent represents represented representing require requires required requiring
    resolve resolves resolved resolving return returns returned returning run runs ran running save saves saved saving select selects selected selecting send sends sent sending
    set sets setting store stores stored storing support supports supported supporting throw throws threw thrown throwing transform transforms transformed transforming
    update updates updated updating use uses used using validate validates validated validating write writes wrote written writing work works worked working
    cause causes caused causing keep keeps kept keeping let lets letting mean means meant meaning produce produces produced producing specify specifies specified specifying
    take takes took taken taking give gives gave given giving access accesses accessed accessing request requests requested requesting respond responds responded responding
    fail fails failed failing succeed succeeds succeeded succeeding start starts started starting stop stops stopped stopping wait waits waited waiting trigger triggers triggered triggering
    return returns returned returning`.split(/\s+/));

  const COMMON_ADJECTIVES = new Set(`available valid invalid optional required active inactive true false empty null undefined asynchronous synchronous public private static dynamic
    local global current previous next default custom simple complex direct indirect automatic manual common different same new existing possible impossible useful safe unsafe
    successful failed compatible incompatible readable writable immutable mutable enabled disabled`.split(/\s+/));

  const THING_WORDS = new Set('everything something anything nothing thing things'.split(' '));
  const IRREGULAR_PARTICIPLES = new Set('built called chosen done found given got gotten kept known made meant read run sent set shown taken thrown written'.split(' '));
  const SENTENCE_BREAK = /[.!?]/;

  function sentenceRanges(text) {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
      return Array.from(seg.segment(text), s => ({ start: s.index, end: s.index + s.segment.length }));
    }
    const out = [];
    const re = /[^.!?]+[.!?]*/g;
    let m;
    while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length });
    return out;
  }

  function tokenize(text) {
    const out = [];
    const re = /[A-Za-z]+(?:['’][A-Za-z]+)?|\d+(?:\.\d+)?|[^\s]/g;
    let m;
    while ((m = re.exec(text))) {
      const raw = m[0];
      out.push({
        text: raw,
        lower: raw.toLowerCase(),
        start: m.index,
        end: m.index + raw.length,
        word: /^[A-Za-z]/.test(raw),
        punct: !/^[A-Za-z0-9]/.test(raw)
      });
    }
    return out;
  }

  function isLikelyAdverb(w) {
    return NEG_ADVERBS.has(w) || (w.length > 4 && w.endsWith('ly'));
  }

  function isLikelyParticiple(w) {
    return IRREGULAR_PARTICIPLES.has(w) || /(?:ed|ing)$/.test(w);
  }

  function isLexicalVerb(w) {
    return VERBS.has(w);
  }

  function tagTokens(tokens) {
    return tokens.map((t, i) => {
      const w = t.lower;
      let tag = 'X';
      if (!t.word) tag = 'PUNCT';
      else if (DETERMINERS.has(w)) tag = 'DET';
      else if (PRONOUNS.has(w)) tag = 'PRON';
      else if (MODALS.has(w)) tag = 'MODAL';
      else if (BE.has(w) || HAVE.has(w) || DO.has(w)) tag = 'AUX';
      else if (PREPOSITIONS.has(w)) tag = 'PREP';
      else if (COORD.has(w)) tag = 'CCONJ';
      else if (SUBORD.has(w) || RELATIVE.has(w)) tag = 'SCONJ';
      else if (THING_WORDS.has(w)) tag = 'PRON';
      else if (isLexicalVerb(w) || LINKING.has(w)) tag = 'VERB';
      else if (COMMON_ADJECTIVES.has(w)) tag = 'ADJ';
      else if (isLikelyAdverb(w)) tag = 'ADV';
      else if (/\d/.test(w)) tag = 'NUM';
      else {
        const prev = tokens[i - 1]?.lower;
        const next = tokens[i + 1]?.lower;
        if (DETERMINERS.has(prev) || POSSESSIVES.has(prev)) tag = 'NOUN';
        else if (prev === 'to' && !DETERMINERS.has(w) && !PREPOSITIONS.has(w)) tag = 'VERB';
        else if ((BE.has(prev) || HAVE.has(prev)) && isLikelyParticiple(w)) tag = 'VERB';
        else if (isLikelyParticiple(w) && !DETERMINERS.has(prev)) tag = 'VERB';
        else if (/^(?:\w+)(?:ous|ive|able|ible|al|ful|less|ic|ary|ory)$/.test(w)) tag = 'ADJ';
        else if (/^[A-Z]/.test(t.text) && i > 0) tag = 'NOUN';
        else if (next && (BE.has(next) || MODALS.has(next) || isLexicalVerb(next))) tag = 'NOUN';
        else tag = 'NOUN';
      }
      return { ...t, tag };
    });
  }

  function isFiniteVerbStart(tokens, i) {
    const t = tokens[i];
    if (!t || !t.word) return false;
    if (t.tag === 'MODAL' || t.tag === 'AUX') return true;
    if (t.tag !== 'VERB') return false;
    const prevToken = tokens[i - 1];
    const prev = prevToken?.lower;
    const next = tokens[i + 1];
    if (prev === 'to') return false; // infinitive, not a finite clause head
    if (prevToken?.tag === 'DET' || prevToken?.tag === 'ADJ' || prevToken?.tag === 'NUM') return false;
    if (prevToken?.text === '-' || tokens[i - 2]?.text === '-') return false; // re-render, user-defined, etc.
    if (t.lower.endsWith('ing') && !BE.has(prev)) return false;
    if (isLikelyParticiple(t.lower) && !AUX.has(prev) && next?.tag === 'NOUN') return false; // fetched values
    return true;
  }

  function consumeVerbPhrase(tokens, start) {
    let i = start;
    let end = start;
    let seenCore = false;
    while (i < tokens.length) {
      const t = tokens[i];
      if (!t.word) break;
      if (t.tag === 'MODAL' || t.tag === 'AUX') {
        end = i; i++; continue;
      }
      if (t.tag === 'ADV' && i > start && !seenCore) { end = i; i++; continue; }
      if (t.tag === 'VERB') {
        end = i; seenCore = true; i++;
        continue;
      }
      break;
    }
    // Hyphenated phrasal verbs common in docs/UI: opt-in, log-in, etc.
    if (seenCore && tokens[i]?.text === '-' && ['in','out','up','off','on'].includes(tokens[i + 1]?.lower)) {
      end = i + 1;
    }
    // A lone auxiliary is valid for linking be, but have/do usually need a core verb.
    return { start, end, seenCore };
  }

  function relativeClauseIntervals(tokens) {
    const intervals = [];
    for (let i = 1; i < tokens.length - 1; i++) {
      if (!RELATIVE.has(tokens[i].lower)) continue;
      let verb = -1;
      for (let j = i + 1; j < Math.min(tokens.length, i + 8); j++) {
        if (isFiniteVerbStart(tokens, j)) { verb = j; break; }
        if (tokens[j].text === ',' || tokens[j].text === ';') break;
      }
      if (verb < 0) continue;
      let end = Math.min(tokens.length - 1, verb + 6);
      for (let j = verb + 1; j < tokens.length; j++) {
        if (tokens[j].text === ',' || tokens[j].text === ';') { end = j; break; }
        if (j > verb + 1 && isFiniteVerbStart(tokens, j)) { end = j - 1; break; }
      }
      intervals.push({ start: i, end, verb });
    }
    return intervals;
  }

  function insideInterval(i, intervals) {
    return intervals.some(x => i >= x.start && i <= x.end);
  }

  function initialSubordinateComma(tokens) {
    if (!tokens.length || !SUBORD.has(tokens[0].lower)) return -1;
    return tokens.findIndex(t => t.text === ',');
  }

  function looksLikeNoise(text) {
    const t = text.trim();
    if (!t) return true;
    if (/^(?:https?:\/\/|www\.)\S+$/i.test(t)) return true;
    if (/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(t)) return true;
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    const urlish = (t.match(/[\/:_.?#=&%]/g) || []).length;
    if (letters >= 5 && urlish >= 5 && urlish / Math.max(t.length, 1) > 0.12) return true;
    return false;
  }

  function shortFragment(tokens) {
    const words = tokens.filter(t => t.word);
    if (words.length > 3) {
      // Marketing/UI noun phrase: “Everything you need to …” has no matrix predicate.
      if (THING_WORDS.has(words[0]?.lower) && words[1]?.tag === 'PRON') return true;
      return false;
    }
    if (words.some(t => t.tag === 'MODAL' || t.tag === 'AUX')) return false;
    const finite = tokens.some((_, i) => isFiniteVerbStart(tokens, i));
    if (!finite) return true;
    // Gerund/participle headings such as “Getting started”.
    if (words.length <= 2 && words[0] && /ing$/.test(words[0].lower)) return true;
    // Ambiguous product/UI labels are much more often noun phrases than commands.
    const ambiguousHead = new Set(['merge','request','requests','report','reports','update','updates','build','builds','release','releases']);
    const hasSentencePunct = /[.!?:;]/.test(tokens.map(t => t.text).join(''));
    if (words.length <= 3 && ambiguousHead.has(words[0].lower) && !hasSentencePunct) return true;
    return false;
  }

  function scoreVerbCandidate(tokens, i, relatives) {
    if (!isFiniteVerbStart(tokens, i)) return -Infinity;
    let score = 0;
    const w = tokens[i].lower;
    const subComma = initialSubordinateComma(tokens);
    if (subComma >= 0) {
      if (i < subComma) score -= 7;
      else if (i > subComma) score += 4;
    }
    if (insideInterval(i, relatives)) score -= 6;
    const nearestSubord = tokens.slice(0, i).map(t => t.lower).lastIndexOf('because');
    if (nearestSubord >= 0 && nearestSubord < i) score -= 4;
    const clauseMarkers = tokens.slice(0, i).filter(t => SUBORD.has(t.lower)).length;
    if (clauseMarkers) score -= Math.min(4, clauseMarkers * 2);
    if (MODALS.has(w) || AUX.has(w)) score += 3;
    if (isLexicalVerb(w)) score += 2;
    if (i > 0) score += Math.max(0, 8 - i) * 0.05; // prefer the earliest plausible finite predicate
    const prev = tokens[i - 1]?.lower;
    if (prev === 'to') score -= 7;
    if (prev && RELATIVE.has(prev)) score -= 4;
    if (tokens.slice(0, i).some(t => t.text === ',')) score += 0.4;
    return score;
  }

  function chooseMainVerb(tokens) {
    const relatives = relativeClauseIntervals(tokens);
    let best = -1;
    let bestScore = -Infinity;
    let candidateStart = 0;
    // In a fronted conditional/adverbial clause, the matrix predicate normally
    // comes after the final comma: "If X, or Y, GitLab creates ...".
    if (SUBORD.has(tokens[0]?.lower)) {
      const commas = tokens.map((t, i) => t.text === ',' ? i : -1).filter(i => i >= 0);
      if (commas.length) candidateStart = commas[commas.length - 1] + 1;
    }
    for (let i = candidateStart; i < tokens.length; i++) {
      const score = scoreVerbCandidate(tokens, i, relatives);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return { index: best, score: bestScore, relatives };
  }

  function trimSubject(tokens, start, end) {
    // Strip an initial subordinate/adverbial phrase ending with a comma.
    const commas = tokens.map((t, idx) => (idx >= start && idx <= end && t.text === ',') ? idx : -1).filter(idx => idx >= 0);
    const comma = (SUBORD.has(tokens[start]?.lower) && commas.length) ? commas[commas.length - 1] : (commas[0] ?? -1);
    if (comma >= 0 && comma < end && (tokens[start].tag === 'PREP' || tokens[start].tag === 'ADV' || SUBORD.has(tokens[start].lower) || /ing$/.test(tokens[start].lower))) start = comma + 1;
    while (start <= end && (tokens[start].tag === 'PUNCT' || COORD.has(tokens[start].lower) || SUBORD.has(tokens[start].lower) || PREPOSITIONS.has(tokens[start].lower))) start++;
    while (end >= start && (tokens[end].tag === 'PUNCT' || tokens[end].text === ',' || tokens[end].tag === 'ADV')) end--;
    return { start, end };
  }

  function findTail(tokens, start) {
    while (start < tokens.length && (['not','never','also','just','only'].includes(tokens[start].lower) || tokens[start].text === ',')) start++;
    if (start >= tokens.length) return null;

    let end = tokens.length - 1;
    while (end >= start && (tokens[end].tag === 'PUNCT' || SENTENCE_BREAK.test(tokens[end].text))) end--;
    if (end < start) return null;

    // Stop before clear adjuncts / subordinate clauses. Keep "to + verb" after verbs like allow/require
    // because it is part of the complement structure, but stop at ordinary prepositions.
    for (let i = start; i <= end; i++) {
      const w = tokens[i].lower;
      if (tokens[i].text === ',' || tokens[i].text === ';') { end = i - 1; break; }
      if (SUBORD.has(w)) { end = i - 1; break; }
      if (COORD.has(w)) {
        const next = tokens[i + 1];
        // Keep noun/adjective coordination inside one object/complement ("X and Y").
        // Stop only when the conjunction clearly starts another finite predicate.
        if (next && isFiniteVerbStart(tokens, i + 1)) { end = i - 1; break; }
        continue;
      }
      if (PREPOSITIONS.has(w)) {
        if (w === 'to' && tokens[i + 1]?.tag === 'VERB') continue;
        if (['in','out','up','off','on'].includes(w) && tokens[i - 1]?.text === '-') continue;
        end = i - 1; break;
      }
    }
    return end >= start ? { start, end } : null;
  }

  function classifyTail(tokens, verbStart, verbEnd, tail) {
    if (!tail) return null;
    const firstVerb = tokens[verbStart].lower;
    const vpWords = tokens.slice(verbStart, verbEnd + 1).filter(t => t.word).map(t => t.lower);
    const hasBe = vpWords.some(w => BE.has(w));
    const lastVerb = vpWords[vpWords.length - 1];

    if (LINKING.has(firstVerb)) return 'c';
    if (hasBe && lastVerb && COMMON_ADJECTIVES.has(tokens[tail.start]?.lower)) return 'c';
    // "is called X", "is considered X" -> complement after passive predicate
    if (hasBe && ['called','named','considered','defined','known','set'].includes(lastVerb)) return 'c';
    return 'o';
  }

  function confidenceFor(tokens, main, subject, vp, tail) {
    let c = 0.58;
    const reasons = [];
    if (main.score >= 3) { c += 0.12; reasons.push('strong-verb'); }
    if (main.relatives.length) { c += 0.05; reasons.push('relative-clause-filter'); }
    if (subject && subject.end >= subject.start) { c += 0.08; reasons.push('subject-found'); }
    if (vp.seenCore || BE.has(tokens[vp.start].lower)) { c += 0.07; reasons.push('verb-phrase'); }
    if (tail) { c += 0.04; reasons.push('tail-found'); }
    if (tokens.length > 24) { c -= 0.12; reasons.push('long-sentence'); }
    if (tokens.filter(t => t.text === ',').length >= 2) { c -= 0.08; reasons.push('multi-clause'); }
    if (main.score < 1) { c -= 0.18; reasons.push('weak-verb'); }
    return { value: Math.max(0.1, Math.min(0.98, c)), reasons };
  }

  function rangeFromTokens(tokens, start, end, role, offset) {
    return {
      role,
      start: tokens[start].start + offset,
      end: tokens[end].end + offset
    };
  }

  function languageProfile(text) {
    const latin = (text.match(/[A-Za-z]/g) || []).length;
    const japanese = (text.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
    const letters = latin + japanese;
    return { latin, japanese, letters, latinRatio: letters ? latin / letters : 0 };
  }

  function isEnglishSentence(text) {
    const p = languageProfile(text);
    // This extension intentionally targets English. A few non-Latin punctuation
    // characters are harmless, but real Japanese/CJK prose should never be fed
    // to the English parser merely because it contains identifiers like "make".
    if (p.japanese >= 3) return false;
    if (p.japanese > 0 && p.latinRatio < 0.9) return false;
    return p.latin >= 5;
  }

  function conditionalMainStart(tokens) {
    if (!tokens.length || !['if', 'when', 'unless', 'although', 'while'].includes(tokens[0].lower)) return -1;
    const comma = tokens.findIndex(t => t.text === ',');
    if (comma < 0 || comma >= tokens.length - 1) return -1;
    for (let i = comma + 1; i < tokens.length; i++) {
      if (!tokens[i].word) continue;
      return i;
    }
    return -1;
  }

  function omittedSubjectApiVerb(tokens) {
    const first = tokens.findIndex(t => t.word);
    if (first < 0) return -1;
    const w = tokens[first].lower;
    // Third-person forms at the start of an API description are descriptive,
    // not imperatives: "Returns X", "Creates Y", "Checks whether ...".
    if (tokens[first].tag === 'VERB' && /s$/.test(w) && !['is','has','does'].includes(w)) return first;
    return -1;
  }

  function analyzeSentence(text, offset = 0) {
    if (!isEnglishSentence(text)) return { ranges: [], confidence: 0, reasons: ['non-english'], ruleId: 'skip.non-english' };
    if (looksLikeNoise(text)) return { ranges: [], confidence: 0, reasons: ['noise-text'], ruleId: 'skip.noise' };

    const raw = tokenize(text);
    const tokens = tagTokens(raw);
    const words = tokens.filter(t => t.word);
    if (words.length < 2) return { ranges: [], confidence: 0, reasons: ['too-short'], ruleId: 'skip.short' };
    if (shortFragment(tokens)) return { ranges: [], confidence: 0.1, reasons: ['short-fragment'], ruleId: 'skip.fragment' };

    // Initial condition + imperative main clause: "If ..., set ...".
    // The visible main clause has an omitted "you" subject, so highlight V/O only.
    const conditionalStart = conditionalMainStart(tokens);
    if (conditionalStart >= 0 && tokens[conditionalStart]?.tag === 'VERB' && isFiniteVerbStart(tokens, conditionalStart) && !/ing$/.test(tokens[conditionalStart].lower)) {
      const vp = consumeVerbPhrase(tokens, conditionalStart);
      const tail = findTail(tokens, vp.end + 1);
      const tailRole = classifyTail(tokens, vp.start, vp.end, tail) || 'o';
      const ranges = [rangeFromTokens(tokens, vp.start, vp.end, 'v', offset)];
      if (tail) ranges.push(rangeFromTokens(tokens, tail.start, tail.end, tailRole, offset));
      return { ranges, confidence: 0.9, reasons: ['conditional-main', 'imperative', 'verb-phrase', ...(tail ? ['tail-found'] : [])], ruleId: 'main.conditional-imperative', tokens };
    }

    // API/reference prose often omits an obvious subject: "Returns ...", "Creates ...".
    // Treat third-person initial verbs as descriptive omitted-subject clauses, not commands.
    const apiVerb = omittedSubjectApiVerb(tokens);
    if (apiVerb === 0) {
      const vp = consumeVerbPhrase(tokens, apiVerb);
      const tail = findTail(tokens, vp.end + 1);
      const tailRole = classifyTail(tokens, vp.start, vp.end, tail) || 'o';
      const ranges = [rangeFromTokens(tokens, vp.start, vp.end, 'v', offset)];
      if (tail) ranges.push(rangeFromTokens(tokens, tail.start, tail.end, tailRole, offset));
      return { ranges, confidence: 0.9, reasons: ['api-omitted-subject', 'verb-phrase', ...(tail ? ['tail-found'] : [])], ruleId: 'main.api-omitted-subject', tokens };
    }

    // Feature lists often omit the subject: “Automatically processes …”,
    // “Not yet supported …”. Do not paint the leading adverb as S.
    let omittedVerb = 0;
    while (omittedVerb < tokens.length && (tokens[omittedVerb].tag === 'ADV' || tokens[omittedVerb].tag === 'CCONJ')) omittedVerb++;
    if (omittedVerb > 0 && isFiniteVerbStart(tokens, omittedVerb)) {
      const vp = consumeVerbPhrase(tokens, omittedVerb);
      const tail = findTail(tokens, vp.end + 1);
      const tailRole = classifyTail(tokens, vp.start, vp.end, tail) || 'o';
      const ranges = [rangeFromTokens(tokens, vp.start, vp.end, 'v', offset)];
      if (tail) ranges.push(rangeFromTokens(tokens, tail.start, tail.end, tailRole, offset));
      return { ranges, confidence: 0.72, reasons: ['omitted-subject', 'verb-phrase', ...(tail ? ['tail-found'] : [])], ruleId: 'main.omitted-subject', tokens };
    }

    // Documentation frequently uses “Label: sentence”. If the RHS has its own
    // subject, ignore the label. If it begins with a lexical verb, the label is
    // the visible subject (“App Router: Uses …”).
    const colon = tokens.findIndex(t => t.text === ':');
    if (colon > 0 && colon < tokens.length - 1) {
      const rhsStart = colon + 1;
      const rhs = tokens.slice(rhsStart);
      const firstRhsWordRel = rhs.findIndex(t => t.word);
      if (firstRhsWordRel >= 0) {
        const firstRhs = rhsStart + firstRhsWordRel;
        if (tokens[firstRhs].tag === 'VERB' && isFiniteVerbStart(tokens, firstRhs)) {
          const vp = consumeVerbPhrase(tokens, firstRhs);
          const subj = trimSubject(tokens, 0, colon - 1);
          const tail = findTail(tokens, vp.end + 1);
          const tailRole = classifyTail(tokens, vp.start, vp.end, tail);
          const ranges = [];
          if (subj.start <= subj.end) ranges.push(rangeFromTokens(tokens, subj.start, subj.end, 's', offset));
          ranges.push(rangeFromTokens(tokens, vp.start, vp.end, 'v', offset));
          if (tail && tailRole) ranges.push(rangeFromTokens(tokens, tail.start, tail.end, tailRole, offset));
          return { ranges, confidence: 0.88, reasons: ['label-subject', 'verb-phrase', ...(tail ? ['tail-found'] : [])], ruleId: 'main.label-subject', tokens };
        }
        const rhsTextStart = tokens[firstRhs].start;
        const rhsComma = tokens.findIndex((t, idx) => idx >= firstRhs && t.text === ',');
        const rhsFiniteBeforeComma = tokens.some((t, idx) => idx >= firstRhs && (rhsComma < 0 || idx < rhsComma) && isFiniteVerbStart(tokens, idx));
        if (rhsComma >= 0 && !rhsFiniteBeforeComma) {
          return { ranges: [], confidence: 0.18, reasons: ['label-fragment'], ruleId: 'skip.label-fragment', tokens };
        }
        const nested = analyzeSentence(text.slice(rhsTextStart), offset + rhsTextStart);
        if (nested.ranges.length) {
          return { ...nested, confidence: Math.max(0.2, nested.confidence - 0.02), reasons: ['label-prefix-ignored', ...nested.reasons], ruleId: `label.${nested.ruleId}` };
        }
      }
    }

    // An initial lexical verb is a strong imperative signal. Check this before
    // global verb scoring so a later coordinated verb cannot steal the clause.
    if (tokens[0]?.tag === 'VERB' && isFiniteVerbStart(tokens, 0) && !/ing$/.test(tokens[0].lower)) {
      const vp = consumeVerbPhrase(tokens, 0);
      const tail = findTail(tokens, vp.end + 1);
      const tailRole = classifyTail(tokens, vp.start, vp.end, tail) || 'o';
      const ranges = [rangeFromTokens(tokens, vp.start, vp.end, 'v', offset)];
      if (tail) ranges.push(rangeFromTokens(tokens, tail.start, tail.end, tailRole, offset));
      return { ranges, confidence: 0.84, reasons: ['imperative', 'verb-phrase', ...(tail ? ['tail-found'] : [])], ruleId: 'main.imperative', tokens };
    }

    const main = chooseMainVerb(tokens);

    // Imperatives have an omitted “you” subject. Highlight the visible V/O
    // instead of inventing an S span from the words before the verb.
    if (main.index === 0 && tokens[0].tag === 'VERB' && !/ing$/.test(tokens[0].lower)) {
      const vp = consumeVerbPhrase(tokens, 0);
      const tail = findTail(tokens, vp.end + 1);
      const tailRole = classifyTail(tokens, vp.start, vp.end, tail) || 'o';
      const ranges = [rangeFromTokens(tokens, vp.start, vp.end, 'v', offset)];
      if (tail) ranges.push(rangeFromTokens(tokens, tail.start, tail.end, tailRole, offset));
      return { ranges, confidence: 0.82, reasons: ['imperative', 'verb-phrase', ...(tail ? ['tail-found'] : [])], ruleId: 'main.imperative', tokens };
    }

    if (main.index <= 0) return { ranges: [], confidence: 0.15, reasons: ['no-main-verb'], ruleId: 'skip.no-main-verb' };

    const vp = consumeVerbPhrase(tokens, main.index);
    const subj = trimSubject(tokens, 0, main.index - 1);
    if (subj.start > subj.end) return { ranges: [], confidence: 0.2, reasons: ['no-subject'], ruleId: 'skip.no-subject' };

    let tail = findTail(tokens, vp.end + 1);
    // Linking verbs can take prepositional/clausal complements: "It seems like ...".
    if (!tail && LINKING.has(tokens[vp.start]?.lower) && tokens[vp.end + 1]?.tag === 'PREP') {
      let end = tokens.length - 1;
      while (end > vp.end && tokens[end].tag === 'PUNCT') end--;
      if (end > vp.end + 1) tail = { start: vp.end + 1, end };
    }
    const tailRole = classifyTail(tokens, vp.start, vp.end, tail);
    const ranges = [
      rangeFromTokens(tokens, subj.start, subj.end, 's', offset),
      rangeFromTokens(tokens, vp.start, vp.end, 'v', offset)
    ];
    if (tail && tailRole) ranges.push(rangeFromTokens(tokens, tail.start, tail.end, tailRole, offset));

    const confidence = confidenceFor(tokens, main, subj, vp, tail);
    const ruleId = main.relatives.length ? 'main.relative-aware' : (BE.has(tokens[vp.start].lower) ? 'main.aux-be' : 'main.lexical');
    return {
      ranges,
      confidence: confidence.value,
      reasons: confidence.reasons,
      ruleId,
      tokens
    };
  }


  function modifierRanges(tokens, coreRanges, offset = 0) {
    if (!tokens?.length) return [];
    const occupied = tokens.map(t => coreRanges.some(r => {
      const start = t.start + offset;
      const end = t.end + offset;
      return start < r.end && end > r.start;
    }));
    const out = [];
    let i = 0;
    const boundary = t => !t || ['.', '!', '?', ';', ':'].includes(t.text) || t.tag === 'CCONJ';
    while (i < tokens.length) {
      while (i < tokens.length && (occupied[i] || boundary(tokens[i]) || tokens[i].text === ',')) i++;
      if (i >= tokens.length) break;
      const start = i;
      let end = i;
      while (end + 1 < tokens.length && !occupied[end + 1] && !boundary(tokens[end + 1]) && tokens[end + 1].text !== ',') end++;
      const words = tokens.slice(start, end + 1).filter(t => t.word);
      const first = words[0];
      if (first) {
        const qualifies = first.tag === 'PREP' || first.tag === 'ADV' || first.tag === 'SCONJ' || SUBORD.has(first.lower);
        // Avoid classifying infinitival complements ("to configure X") as modifiers.
        const infinitive = first.lower === 'to' && words[1]?.tag === 'VERB';
        if (qualifies && !infinitive) {
          let a = start, b = end;
          while (a <= b && !tokens[a].word) a++;
          while (b >= a && !tokens[b].word) b--;
          if (a <= b) out.push(rangeFromTokens(tokens, a, b, 'm', offset));
        }
      }
      i = end + 1;
    }
    return out;
  }

  function analyze(text) {
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const sentences = [];
    const ranges = [];
    const coarseRanges = sentenceRanges(text);
    const parseRanges = [];
    for (const r of coarseRanges) {
      const segment = text.slice(r.start, r.end);
      let last = 0;
      for (let i = 0; i < segment.length; i++) {
        if (segment[i] === ';') {
          parseRanges.push({ start: r.start + last, end: r.start + i });
          last = i + 1;
        }
      }
      if (last < segment.length) parseRanges.push({ start: r.start + last, end: r.end });
    }
    for (const r of parseRanges) {
      const sentenceText = text.slice(r.start, r.end);
      if ((sentenceText.match(/[A-Za-z]/g) || []).length < 5) continue;
      const result = analyzeSentence(sentenceText, r.start);
      const modifier = result.tokens ? modifierRanges(result.tokens, result.ranges, r.start) : [];
      result.ranges = [...result.ranges, ...modifier];
      ranges.push(...result.ranges);
      const leading = sentenceText.length - sentenceText.trimStart().length;
      const cleanText = sentenceText.trim();
      sentences.push({
        text: cleanText,
        start: r.start + leading,
        end: r.start + leading + cleanText.length,
        confidence: result.confidence,
        reasons: result.reasons,
        ruleId: result.ruleId,
        ranges: result.ranges.map(x => ({ ...x, start: x.start - r.start - leading, end: x.end - r.start - leading }))
          .filter(x => x.start >= 0 && x.end <= cleanText.length)
      });
    }
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return { version: VERSION, ranges, sentences, durationMs: Math.max(0, ended - started) };
  }

  return { VERSION, tokenize, tagTokens, isEnglishSentence, analyzeSentence, analyze };
});
