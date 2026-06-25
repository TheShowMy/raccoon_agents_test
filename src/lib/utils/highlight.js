/**
 * 语法高亮工具 —— 从 legacy/hello-world.html 迁移
 *
 * 导出 escapeHTML(code) 和 highlightCode(code, lang)
 */

/**
 * 对 21 种语言的语法高亮定义
 * 每项：{ k: 关键字, b: 内置函数, t: 类型, lc: 行注释, bc: 块注释, sq: 字符串引号 }
 */
const HIGHLIGHT_DEFS = {
  c:          { k:'auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while', b:'printf scanf main include define NULL stdin stdout stderr FILE', t:'int char float double void long short unsigned size_t', lc:'//', bc:['/*','*/'], sq:['"'] },
  'c++':      { k:'auto break case class const continue default delete do else enum explicit export extern false for friend goto if inline int long namespace new noexcept nullptr operator override private protected public register return short signed sizeof static struct switch template this throw true try typedef typeid typename union unsigned using virtual void volatile while', b:'cout cin cerr endl printf scanf main std include define string vector map iostream', t:'int char float double void long short unsigned bool string vector map auto size_t', lc:'//', bc:['/*','*/'], sq:['"'] },
  python:     { k:'and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield', b:'print len range int str list dict set tuple bool type input open', t:'int float str list dict tuple bool set None True False', lc:'#', bc:null, sq:['"',"'"] },
  java:       { k:'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while', b:'System out println print main String args', t:'int long float double boolean char byte short void String Object', lc:'//', bc:['/*','*/'], sq:['"'] },
  javascript: { k:'async await break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield', b:'console log error warn document window alert Math JSON parseInt', t:'var let const function class undefined null', lc:'//', bc:['/*','*/'], sq:['"',"'",'`'] },
  go:         { k:'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var', b:'fmt Println Printf main make len append nil true false', t:'int string bool float64 float32 byte rune error', lc:'//', bc:['/*','*/'], sq:['"','`'] },
  rust:       { k:'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while', b:'println print format vec String main Some None Ok Err', t:'i32 i64 u32 u64 f32 f64 bool char str String Vec Option Result', lc:'//', bc:['/*','*/'], sq:['"'] },
  ruby:       { k:'alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield', b:'puts print gets require include attr_accessor', t:'String Integer Float Array Hash Symbol true false nil', lc:'#', bc:null, sq:['"',"'"] },
  swift:      { k:'as associatedtype break case catch class continue default defer do else enum extension fallthrough false fileprivate for func guard if import in init inout internal is let nil open operator private protocol public repeat rethrows return self static struct subscript super switch throw throws true try typealias var where while', b:'print main', t:'Int String Double Float Bool Array Dictionary Set Optional', lc:'//', bc:['/*','*/'], sq:['"'] },
  kotlin:     { k:'as break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while', b:'println print main', t:'Int String Boolean Double Float List Map Set', lc:'//', bc:['/*','*/'], sq:['"'] },
  php:        { k:'abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public require require_once return static switch throw trait try unset use var while xor yield', b:'echo print', t:'int float string bool array null', lc:'//', bc:['/*','*/'], sq:['"',"'"] },
  'c#':       { k:'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while', b:'Console WriteLine Write ReadLine Main', t:'int string bool double float char byte long decimal void var', lc:'//', bc:['/*','*/'], sq:['"'] },
  typescript: { k:'abstract as async await break case catch class const continue debugger declare default delete do else enum export extends finally for function if implements import in instanceof interface keyof let namespace new of return super switch this throw try type typeof var void while with yield', b:'console log error warn', t:'string number boolean void any never unknown null undefined', lc:'//', bc:['/*','*/'], sq:['"',"'",'`'] },
  lua:        { k:'and break do else elseif end false for function goto if in local nil not or repeat return then true until while', b:'print io io.write string table math', t:'nil true false', lc:'--', bc:['--[[',']]'], sq:['"',"'"] },
  shell:      { k:'if then else elif fi for while do done case esac in function return break continue', b:'echo exit cd ls cat grep sed awk export source', t:'', lc:'#', bc:null, sq:['"',"'"] },
  sql:        { k:'SELECT FROM WHERE INSERT UPDATE DELETE CREATE DROP ALTER TABLE INDEX INTO VALUES SET AND OR NOT NULL AS JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER ASC DESC HAVING DISTINCT COUNT SUM AVG MIN MAX BETWEEN LIKE IN EXISTS UNION ALL', b:'', t:'', lc:'--', bc:['/*','*/'], sq:["'"] },
  r:          { k:'if else for while repeat break next function return in NULL TRUE FALSE Inf NaN NA', b:'cat print summary mean sd plot library require', t:'NULL TRUE FALSE', lc:'#', bc:null, sq:['"',"'"] },
  scala:      { k:'abstract case catch class def do else extends false final finally for forSome if implicit import lazy match new null object override package private protected return sealed super this throw trait try true type val var while with yield', b:'println print main Array String Unit', t:'Int String Boolean Double Float Long Unit', lc:'//', bc:['/*','*/'], sq:['"'] },
  perl:       { k:'do else elsif for foreach goto if last my next no our package redo require return sub unless until use while', b:'print say strict warnings', t:'my our', lc:'#', bc:null, sq:['"',"'"] },
  dart:       { k:'abstract as assert async await break case catch class const continue covariant default deferred do dynamic else enum export extends extension external factory false final finally for Function get hide if implements import in interface is late library mixin new null on operator part required rethrow return set show static super switch sync this throw true try typedef var void while with yield', b:'print main', t:'int String double bool void List Map Set dynamic', lc:'//', bc:['/*','*/'], sq:["'",'"'] },
  haskell:    { k:'as case class data default deriving do forall foreign hiding if import in infix infixl infixr instance let module newtype of qualified then type where', b:'putStrLn print main', t:'IO Int Integer String Bool Char', lc:'--', bc:['{-','-}'], sq:['"'] }
};

/**
 * 转义 HTML 特殊字符（& < >）
 */
export function escapeHTML(code) {
  return code.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 对指定语言的代码进行语法高亮
 * @param {string} code  原始代码文本
 * @param {string} lang  语言名称（不区分大小写）
 * @returns {string} 包含 <span class="token ..."> 标签的 HTML
 */
export function highlightCode(code, lang) {
  const def = HIGHLIGHT_DEFS[lang.toLowerCase()];
  let html = escapeHTML(code);
  if (!def) return html;

  const placeholders = [];
  let idx = 0;

  /* ---- 1. 保护字符串 ---- */
  const sq = def.sq || [];
  if (sq.length) {
    const strPatterns = [];
    for (let si = 0; si < sq.length; si++) {
      const q = sq[si];
      if (q === '`') {
        strPatterns.push('`(?:\\\\.|[^`\\\\])*`');
      } else {
        strPatterns.push(q + '(?:\\\\.|[^' + q + '\\\\])*' + q);
      }
    }
    const strRe = new RegExp(strPatterns.join('|'), 'g');
    html = html.replace(strRe, function (m) {
      const key = '\x00' + (idx++) + '\x01';
      placeholders.push('<span class="token string">' + m + '</span>');
      return key;
    });
  }

  /* ---- 2. 保护块注释 ---- */
  if (def.bc) {
    const escRe = /[.*+?^${}()|[\]\\\/]/g;
    const bcStart = def.bc[0].replace(escRe, '\\$&');
    const bcEnd   = def.bc[1].replace(escRe, '\\$&');
    const bcRe = new RegExp(bcStart + '[\\s\\S]*?' + bcEnd, 'g');
    html = html.replace(bcRe, function (m) {
      const key = '\x00' + (idx++) + '\x01';
      placeholders.push('<span class="token comment">' + m + '</span>');
      return key;
    });
  }

  /* ---- 3. 保护行注释 ---- */
  if (def.lc) {
    const escReL = /[.*+?^${}()|[\]\\\/]/g;
    const lcEsc = def.lc.replace(escReL, '\\$&');
    const lcRe = new RegExp(lcEsc + '.*$', 'gm');
    html = html.replace(lcRe, function (m) {
      const key = '\x00' + (idx++) + '\x01';
      placeholders.push('<span class="token comment">' + m + '</span>');
      return key;
    });
  }

  /* ---- 4. 收集标识符并按优先级归类 ---- */
  const allWords = [];
  const wordType = {};

  function addWordList(words, type) {
    if (!words) return;
    const arr = words.split(' ');
    for (let i = 0; i < arr.length; i++) {
      const w = arr[i];
      if (w && !(w in wordType)) {
        wordType[w] = type;
        allWords.push(w);
      }
    }
  }

  addWordList(def.t, 'type');
  addWordList(def.b, 'builtin');
  addWordList(def.k, 'keyword');

  // 按长度降序，避免短词覆盖长词子串
  allWords.sort(function (a, b) { return b.length - a.length; });

  if (allWords.length) {
    const identRe = new RegExp('\\b(' + allWords.join('|') + ')\\b', 'g');
    html = html.replace(identRe, function (m) {
      return '<span class="token ' + wordType[m] + '">' + m + '</span>';
    });
  }

  /* ---- 5. 还原占位符 ---- */
  html = html.replace(/\x00(\d+)\x01/g, function (_, i) {
    return placeholders[parseInt(i, 10)];
  });

  /* ---- 6. 数字 ---- */
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="token number">$1</span>');

  /* ---- 7. 布尔 / 空值字面量 ---- */
  html = html.replace(/\b(true|false|nil|null|undefined|None|True|False)\b/g, '<span class="token boolean">$1</span>');

  /* ---- 8. PHP 开放标签 ---- */
  if (lang.toLowerCase() === 'php') {
    html = html.replace(/(&lt;\?)(php|=)?/g, '<span class="token keyword">$1$2</span>');
  }

  return html;
}
