import { ComprehensiveMetadata } from '../services/musicMetadataService';

export type SongLanguage = 'English' | 'Tagalog' | 'Multi-lingual';

/**
 * Common high-frequency Tagalog / Filipino words and worship terms.
 */
const TAGALOG_WORDS = new Set([
  'ang', 'mga', 'ng', 'sa', 'nang', 'at', 'ay', 'kung', 'pag', 'puso', 'pusong',
  'diyos', 'panginoon', 'dakila', 'biyaya', 'kaligtasan', 'papuri', 'awit', 'awitin',
  'lualhati', 'banal', 'kailanman', 'magpakailanman', 'tapat', 'katapatan', 'lakas',
  'sandigan', 'panata', 'sukdulan', 'sukdulang', 'basag', 'buhay', 'pag-ibig',
  'pagmamahal', 'ikaw', 'siya', 'kami', 'tayo', 'mo', 'ko', 'akin', 'iyo', "sa'yo",
  "sa'kin", 'nagmamahal', 'sumasamba', 'sumasamo', 'gabay', 'tanglaw', 'liwanag',
  'ilaw', 'langit', 'lupa', 'hari', 'kapangyarihan', 'kaharian', 'kabutihan',
  'pagsamba', 'dakilang', 'biyayang', 'tanging', 'haring', 'luwalhati', 'hesus',
  'panginoong', 'walang', 'hanggan', 'sasambahin', 'kay', 'lahat', 'aking', 'iyong',
  'aming', 'ating', 'kanila', 'nila', 'natin', 'namin', 'inyo', 'dito', 'doon',
  'saan', 'paano', 'bakit', 'sino', 'kailan', 'bawat', 'sandali', 'tanging',
  'pagpupuri', 'pagdakila', 'paglilingkod', 'pagpupugay', 'tahanan', 'piling',
  'biyaya', 'krus', 'dugo', 'sala', 'kasalanan', 'patawad', 'buhos', 'ulan',
  'espiritu', 'puspos', 'sigaw', 'sayaw', 'talon', 'alakdan', 'tagumpay', 'wagi',
  'bayan', 'lahing', 'pinili', 'pagpapala', 'pag-asa', 'tayo’y', 'kami’y', 'ikaw’y'
]);

/**
 * Common high-frequency English worship and general words.
 */
const ENGLISH_WORDS = new Set([
  'the', 'and', 'of', 'to', 'in', 'you', 'your', 'lord', 'god', 'jesus',
  'holy', 'praise', 'worship', 'forever', 'grace', 'love', 'glory', 'savior',
  'king', 'worthy', 'mighty', 'faithful', 'father', 'heart', 'life', 'name',
  'great', 'greater', 'heaven', 'earth', 'hallelujah', 'spirit', 'presence',
  'cross', 'light', 'we', 'i', 'my', 'our', 'all', 'is', 'are', 'was', 'were',
  'with', 'for', 'on', 'at', 'by', 'from', 'as', 'be', 'this', 'that', 'have',
  'has', 'will', 'shall', 'sing', 'song', 'shout', 'crown', 'throne', 'mercy',
  'lamb', 'saved', 'redeemed', 'freedom', 'free', 'chains', 'broken', 'higher',
  'highest', 'power', 'majesty', 'blessed', 'blessing', 'forevermore', 'amen'
]);

/**
 * Known Filipino song title phrases / keywords for quick title-based heuristic.
 */
const TAGALOG_TITLE_PHRASES = [
  'pusong basag',
  'sukdulang biyaya',
  'panata',
  'diyos ka sa amin',
  'walang hanggang sasambahin',
  'tapat kailanman',
  'banal mong tahanan',
  'katapatan mo o diyos',
  'kay buti-buti mo',
  'kay buti mo',
  'dakilang katapatan',
  'biyaya mo',
  'haring dakila',
  'bawat pintig',
  'salamat panginoon',
  'papuri sa diyos',
  'ang tanging nais ko',
  'puso ko’y',
  'puso koy',
  'o diyos',
  'o panginoon',
  'sa piling mo',
  'sa krus',
  'tayo ay sumamba',
  'sasambahin kita',
  'walang katulad',
  'wala kang katulad',
  'dakila ka',
  'itaas ang ngalan',
  'kabanal-banalan'
];

/**
 * Tokenizes text into lowercase words.
 */
function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/\[.*?\]/g, ' ') // remove lyric section tags like [Verse 1]
    .replace(/[^a-z0-9\s'’\-]/gi, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1);
}

export interface LanguageDetectionResult {
  language: SongLanguage;
  confidence: 'high' | 'medium' | 'low';
  dominantScore: number;
  reason: string;
  tagalogMatchCount: number;
  englishMatchCount: number;
}

/**
 * Detects whether a song's language is English, Tagalog, or Multi-lingual.
 * Follows strict priority:
 * 1. Lyrics is the strongest indicator.
 * 2. Song title & metadata when lyrics are absent.
 * 3. Never rely solely on artist origin (e.g. Filipino artist singing English = English).
 * 4. Mixed lyrics containing both English and Tagalog are classified as Multi-lingual.
 */
export function detectSongLanguage(
  title: string,
  lyrics?: string,
  metadata?: ComprehensiveMetadata
): LanguageDetectionResult {
  const cleanTitle = (title || '').trim().toLowerCase();
  const cleanLyrics = (lyrics || '').trim();

  // 1. Analyze lyrics if available (Strongest indicator)
  if (cleanLyrics && cleanLyrics.length > 30) {
    const tokens = tokenizeWords(cleanLyrics);
    let tagalogCount = 0;
    let englishCount = 0;

    for (const token of tokens) {
      if (TAGALOG_WORDS.has(token)) tagalogCount++;
      if (ENGLISH_WORDS.has(token)) englishCount++;
    }

    const totalIdentified = tagalogCount + englishCount;

    if (totalIdentified >= 4) {
      const tagalogRatio = tagalogCount / totalIdentified;
      const englishRatio = englishCount / totalIdentified;

      // Both languages have substantial presence -> Multi-lingual
      if (tagalogCount >= 2 && englishCount >= 2 && tagalogRatio >= 0.25 && englishRatio >= 0.25) {
        return {
          language: 'Multi-lingual',
          confidence: totalIdentified >= 8 ? 'high' : 'medium',
          dominantScore: 50,
          reason: `Contains both Tagalog (${tagalogCount}) and English (${englishCount}) lyrics content.`,
          tagalogMatchCount: tagalogCount,
          englishMatchCount: englishCount
        };
      }

      if (tagalogRatio >= 0.60) {
        return {
          language: 'Tagalog',
          confidence: totalIdentified >= 8 ? 'high' : 'medium',
          dominantScore: Math.round(tagalogRatio * 100),
          reason: `Detected Tagalog based on lyrics vocabulary (${tagalogCount} Tagalog indicators vs ${englishCount} English).`,
          tagalogMatchCount: tagalogCount,
          englishMatchCount: englishCount
        };
      } else if (englishRatio >= 0.60) {
        return {
          language: 'English',
          confidence: totalIdentified >= 8 ? 'high' : 'medium',
          dominantScore: Math.round(englishRatio * 100),
          reason: `Detected English based on lyrics vocabulary (${englishCount} English indicators vs ${tagalogCount} Tagalog).`,
          tagalogMatchCount: tagalogCount,
          englishMatchCount: englishCount
        };
      } else {
        return {
          language: 'Multi-lingual',
          confidence: 'medium',
          dominantScore: 50,
          reason: `Mixed multilingual lyrics without a single dominant language (${tagalogCount} Tagalog, ${englishCount} English).`,
          tagalogMatchCount: tagalogCount,
          englishMatchCount: englishCount
        };
      }
    }
  }

  // 2. Analyze title
  for (const phrase of TAGALOG_TITLE_PHRASES) {
    if (cleanTitle.includes(phrase)) {
      return {
        language: 'Tagalog',
        confidence: 'high',
        dominantScore: 90,
        reason: `Title contains recognizable Tagalog worship title pattern ("${phrase}").`,
        tagalogMatchCount: 1,
        englishMatchCount: 0
      };
    }
  }

  const titleTokens = tokenizeWords(cleanTitle);
  let titleTagalog = 0;
  let titleEnglish = 0;

  for (const t of titleTokens) {
    if (TAGALOG_WORDS.has(t)) titleTagalog++;
    if (ENGLISH_WORDS.has(t)) titleEnglish++;
  }

  if (titleTagalog > 0 && titleEnglish > 0) {
    return {
      language: 'Multi-lingual',
      confidence: 'medium',
      dominantScore: 50,
      reason: `Song title contains both Tagalog and English words.`,
      tagalogMatchCount: titleTagalog,
      englishMatchCount: titleEnglish
    };
  }

  if (titleTagalog > 0 && titleTagalog >= titleEnglish) {
    return {
      language: 'Tagalog',
      confidence: titleTagalog >= 2 ? 'high' : 'medium',
      dominantScore: 80,
      reason: `Song title contains Tagalog words.`,
      tagalogMatchCount: titleTagalog,
      englishMatchCount: titleEnglish
    };
  }

  if (titleEnglish > 0 && titleEnglish > titleTagalog) {
    return {
      language: 'English',
      confidence: titleEnglish >= 2 ? 'high' : 'medium',
      dominantScore: 80,
      reason: `Song title contains English words.`,
      tagalogMatchCount: titleTagalog,
      englishMatchCount: titleEnglish
    };
  }

  // 3. Fallback to metadata hints if provided
  if (metadata?.language) {
    const metaLang = metadata.language.toLowerCase();
    if (metaLang.includes('multi') || metaLang.includes('taglish') || metaLang.includes('bilingual')) {
      return {
        language: 'Multi-lingual',
        confidence: 'medium',
        dominantScore: 70,
        reason: `Metadata source indicated Multi-lingual song content.`,
        tagalogMatchCount: 0,
        englishMatchCount: 0
      };
    }
    if (metaLang.includes('tagalog') || metaLang.includes('filipino')) {
      return {
        language: 'Tagalog',
        confidence: 'medium',
        dominantScore: 70,
        reason: `Metadata source indicated Tagalog language.`,
        tagalogMatchCount: 0,
        englishMatchCount: 0
      };
    }
    if (metaLang.includes('english')) {
      return {
        language: 'English',
        confidence: 'medium',
        dominantScore: 70,
        reason: `Metadata source indicated English language.`,
        tagalogMatchCount: 0,
        englishMatchCount: 0
      };
    }
  }

  // 4. Default to English if no other markers detected
  return {
    language: 'English',
    confidence: 'low',
    dominantScore: 50,
    reason: `Standard English default.`,
    tagalogMatchCount: 0,
    englishMatchCount: 0
  };
}

/**
 * Sanitizes existing stored language values, safely normalizing to
 * 'English' | 'Tagalog' | 'Multi-lingual'.
 */
export function sanitizeSongLanguage(lang?: string): SongLanguage {
  if (!lang) return 'English';
  const clean = lang.trim().toLowerCase();
  if (clean === 'english') return 'English';
  if (clean === 'tagalog' || clean === 'filipino') return 'Tagalog';
  if (clean === 'multi-lingual' || clean === 'multilingual' || clean === 'taglish' || clean === 'bilingual') {
    return 'Multi-lingual';
  }
  return 'English';
}

