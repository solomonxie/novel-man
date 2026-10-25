/**
 * Colour for code, by hand rather than by package: a few word lists and one
 * pattern per family cover what technical books are written in, and a real
 * grammar engine is hundreds of kilobytes for the last few percent of
 * accuracy. Unknown or unnamed languages are guessed at from the code.
 */
export type TokenKind = 'plain' | 'keyword' | 'type' | 'string' | 'comment' | 'number' | 'meta';
export type Token = { text: string; kind: TokenKind };

type Family = 'c' | 'hash' | 'sql' | 'markup' | 'plain';

const words = (list: string) => new Set(list.split(' '));

const C_KEYWORDS = words(
  'alignas alignof and asm auto break case catch class concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern false final for friend goto if inline mutable namespace new noexcept not nullptr operator or override private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union using virtual volatile while ' +
    'abstract async await boolean extends implements import instanceof interface let native package super synchronized throws transient var yield function typeof undefined null of in as from readonly declare keyof type ' +
    'func go chan defer fallthrough map range select fn impl mut pub crate mod trait where loop match ref self Self dyn move unsafe ' +
    'guard fileprivate internal open some any lazy weak unowned val fun object when companion data sealed suspend'
);
const C_TYPES = words(
  'void bool char short int long float double signed unsigned size_t ptrdiff_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t wchar_t char8_t char16_t char32_t string vector map set array span unique_ptr shared_ptr weak_ptr optional variant byte rune error uint i8 i16 i32 i64 u8 u16 u32 u64 f32 f64 usize isize str String Vec Option Result number object symbol bigint never unknown'
);
const HASH_KEYWORDS = words(
  'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case ' +
    'begin end module require then unless until do done fi esac function local export echo exit elsif nil self'
);
const SQL_KEYWORDS = words(
  'select from where insert into values update set delete create table index view drop alter add join left right inner outer on group by order having limit offset as and or not null is in like between distinct union all primary key foreign references default unique case when then else end exists begin commit rollback transaction with recursive integer text real blob'
);

const FAMILY: Record<string, Family> = {};
for (const name of 'c h cpp c++ cc cxx hpp hxx objc objective-c java js javascript mjs jsx ts typescript tsx go golang rust rs swift kotlin kt cs csharp c# scala dart php groovy json jsonc proto protobuf glsl hlsl cuda zig v d'.split(' ')) FAMILY[name] = 'c';
for (const name of 'python py python3 ruby rb sh bash shell zsh console shell-session fish yaml yml toml perl pl r makefile make dockerfile nginx conf ini cmake elixir ex nim powershell ps1'.split(' ')) FAMILY[name] = 'hash';
for (const name of 'sql sqlite mysql postgres postgresql psql lua haskell hs ada'.split(' ')) FAMILY[name] = 'sql';
for (const name of 'html xml xhtml svg vue'.split(' ')) FAMILY[name] = 'markup';
for (const name of 'text txt plain plaintext output none diff'.split(' ')) FAMILY[name] = 'plain';

/** An unnamed block, guessed at: the CppCoreGuidelines name none of theirs. */
export function familyOf(lang: string, code: string): Family {
  const named = FAMILY[lang.toLowerCase()];
  if (named) return named;
  if (/^\s*<[a-z!?][^>]*>/i.test(code)) return 'markup';
  if (/^\s*(def |import \w+$|from [\w.]+ import |elif |print\()/m.test(code)) return 'hash';
  if (/^\s*\$ /m.test(code) || /^#!.*\b(ba|z)?sh\b/.test(code)) return 'hash';
  if (/^\s*(SELECT|INSERT|CREATE|UPDATE)\b/i.test(code)) return 'sql';
  return 'c';
}

const STRING = `"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'`;
const NUMBER = `\\b(?:0x[\\da-fA-F']+|\\d[\\d']*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)[a-zA-Z]*\\b`;
const WORD = `[A-Za-z_$][\\w$]*`;

/** Groups, in this order: comment, string, number, meta, word. */
const PATTERNS: Record<Exclude<Family, 'plain' | 'markup'>, RegExp> = {
  c: new RegExp(`(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|(?![\\s\\S])))|(${STRING}|\`(?:\\\\.|[^\`\\\\])*\`)|(${NUMBER})|(^[ \\t]*#[ \\t]*\\w+|@\\w+)|(${WORD})`, 'gm'),
  hash: new RegExp(`(#[^\\n]*)|("""[\\s\\S]*?(?:"""|(?![\\s\\S]))|'''[\\s\\S]*?(?:'''|(?![\\s\\S]))|${STRING})|(${NUMBER})|(^[ \\t]*\\$(?= )|@\\w+|\\$\\{?\\w+\\}?)|(${WORD})`, 'gm'),
  sql: new RegExp(`(--[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|(?![\\s\\S])))|(${STRING})|(${NUMBER})|(@\\w+)|(${WORD})`, 'gm'),
};
const MARKUP = /(<!--[\s\S]*?(?:-->|$))|("[^"\n]*"|'[^'\n]*')|(<\/?[\w:-]+|\/?>)|([\w:-]+(?==))/g;

const KEYWORDS: Record<string, Set<string>> = { c: C_KEYWORDS, hash: HASH_KEYWORDS, sql: SQL_KEYWORDS };

function scan(code: string, family: Family): Token[] {
  if (family === 'plain') return [{ text: code, kind: 'plain' }];
  const tokens: Token[] = [];
  let cursor = 0;
  const push = (text: string, kind: TokenKind) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) last.text += text;
    else tokens.push({ text, kind });
  };
  const pattern = family === 'markup' ? MARKUP : PATTERNS[family];
  pattern.lastIndex = 0;
  for (const match of code.matchAll(pattern)) {
    const at = match.index ?? 0;
    push(code.slice(cursor, at), 'plain');
    cursor = at + match[0].length;
    if (family === 'markup') {
      push(match[0], match[1] ? 'comment' : match[2] ? 'string' : match[3] ? 'keyword' : 'type');
      continue;
    }
    if (match[1]) push(match[0], 'comment');
    else if (match[2]) push(match[0], 'string');
    else if (match[3]) push(match[0], 'number');
    else if (match[4]) push(match[0], 'meta');
    else {
      const word = match[0];
      const keywords = KEYWORDS[family];
      const kind: TokenKind =
        keywords.has(family === 'sql' ? word.toLowerCase() : word)
          ? 'keyword'
          : family === 'c' && (C_TYPES.has(word) || /^[A-Z][a-z]\w*$/.test(word))
            ? 'type'
            : 'plain';
      push(word, kind);
    }
  }
  push(code.slice(cursor), 'plain');
  return tokens;
}

/** The same block is drawn again on every render; it is coloured once. */
const cache = new Map<string, Token[]>();
const CACHE_SIZE = 200;

export function highlight(code: string, lang = ''): Token[] {
  const key = `${lang}\u0000${code}`;
  const known = cache.get(key);
  if (known) return known;
  const tokens = scan(code, familyOf(lang, code));
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  cache.set(key, tokens);
  return tokens;
}
