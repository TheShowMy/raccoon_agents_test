function escapeHTML(code) {
  return code.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;');
}

function highlightCode(code, lang) {
  var def = { k:'function return', b:'console log', t:'', lc:'//', bc:['/*','*/'], sq:['"',"'",'`'] };
  var html = escapeHTML(code);
  var placeholders = [];
  var idx = 0;

  var sq = def.sq || [];
  if (sq.length) {
    var strPatterns = [];
    for (var si = 0; si < sq.length; si++) {
      var q = sq[si];
      if (q === '`') {
        strPatterns.push('`(?:\\\\.|[^`\\\\])*`');
      } else {
        strPatterns.push(q + '(?:\\\\.|[^' + q + '\\\\])*' + q);
      }
    }
    var strRe = new RegExp(strPatterns.join('|'), 'g');
    html = html.replace(strRe, function (m) {
      var key = '\x00' + (idx++) + '\x01';
      placeholders.push('<span class="token string">' + m + '</span>');
      return key;
    });
  }

  if (def.bc) {
    var escRe = /[.*+?^${}()|[\]\\\/]/g;
    var bcStart = def.bc[0].replace(escRe, '\\$&');
    var bcEnd   = def.bc[1].replace(escRe, '\\$&');
    var bcRe = new RegExp(bcStart + '[\\s\\S]*?' + bcEnd, 'g');
    html = html.replace(bcRe, function (m) {
      var key = '\x00' + (idx++) + '\x01';
      placeholders.push('<span class="token comment">' + m + '</span>');
      return key;
    });
  }

  if (def.lc) {
    var escReL = /[.*+?^${}()|[\]\\\/]/g;
    var lcEsc = def.lc.replace(escReL, '\\$&');
    var lcRe = new RegExp(lcEsc + '.*$', 'gm');
    html = html.replace(lcRe, function (m) {
      var key = '\x00' + (idx++) + '\x01';
      placeholders.push('<span class="token comment">' + m + '</span>');
      return key;
    });
  }

  html = html.replace(/\x00(\d+)\x01/g, function (_, i) {
    return placeholders[parseInt(i, 10)];
  });

  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="token number">$1</span>');

  html = html.replace(/\b(true|false|nil|null|undefined|None|True|False)\b/g, '<span class="token boolean">$1</span>');

  return html;
}

var samples = [
  'var x = "Hello 123";',
  '// comment 42\nvar a = 0;',
  '/* block 99 */ var b = 7;',
  'var y = 0;'
];

samples.forEach(function(s){
  console.log('IN :', s);
  console.log('OUT:', highlightCode(s, 'js'));
  console.log('');
});
