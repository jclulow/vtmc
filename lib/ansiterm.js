
var util = require('util');
var events = require('events');

var ESC = '\u001b';
var CSI = ESC + '[';

var LINEDRAW_UTF8 = {
  horiz: '\u2501',
  verti: '\u2503',
  topleft: '\u250f',
  topright: '\u2513',
  bottomright: '\u251b',
  bottomleft: '\u2517'
};
var LINEDRAW_VT100 = {
  horiz: '\u0071',
  verti: '\u0078',
  topleft: '\u006c',
  topright: '\u006b',
  bottomright: '\u006a',
  bottomleft: '\u006d'
};
var LINEDRAW_ASCII = {
  horiz: '-',
  verti: '|',
  topleft: '+',
  topright: '+',
  bottomright: '+',
  bottomleft: '+'
};

var parsetable = {
  'REST': [
    { c: 0x1b, acts: [ { a: 'STATE', b: 'ESCAPE' }, { a: 'TIMEOUT', e: 'ESC' } ] },
    { c: 0x00, acts: [ { a: 'EMIT', b: 'NUL', } ] },
    { c: 0x01, acts: [ { a: 'EMIT', b: '^A', } ] },
    { c: 0x02, acts: [ { a: 'EMIT', b: '^B', } ] },
    { c: 0x03, acts: [ { a: 'EMIT', b: '^C', d: true } ] },
    { c: 0x04, acts: [ { a: 'EMIT', b: '^D' } ] },
    { c: 0x05, acts: [ { a: 'EMIT', b: '^E', } ] },
    { c: 0x06, acts: [ { a: 'EMIT', b: '^F', } ] },
    { c: 0x07, acts: [ { a: 'EMIT', b: 'BEL', } ] },
    { c: 0x08, acts: [ { a: 'EMIT', b: 'BS' } ] },
    { c: 0x09, acts: [ { a: 'EMIT', b: 'TAB' } ] },
    { c: 0x0a, acts: [ { a: 'EMIT', b: 'LF' } ] },
    { c: 0x0d, acts: [ { a: 'EMIT', b: 'CR' } ] },
    { c: 0x15, acts: [ { a: 'EMIT', b: 'NAK' } ] },
    { c: 0x7f, acts: [ { a: 'EMIT', b: 'DEL' } ] },
    { acts: [ { a: 'EMIT', b: 'keypress', c: true } ] } // default
  ],
  'ESCAPE': [
    { acts: [ { a: 'EMIT', b: 'keypress', c: true }, { a: 'STATE', b: 'REST' } ] }, // default
    { c: '[', acts: [ { a: 'STATE', b: 'CTRLSEQ' } ] }
  ],
  'CTRLSEQ': [
    { c: '0', acts: [ { a: 'STORE' } ] },
    { c: '1', acts: [ { a: 'STORE' } ] },
    { c: '2', acts: [ { a: 'STORE' } ] },
    { c: '3', acts: [ { a: 'STORE' } ] },
    { c: '4', acts: [ { a: 'STORE' } ] },
    { c: '5', acts: [ { a: 'STORE' } ] },
    { c: '6', acts: [ { a: 'STORE' } ] },
    { c: '7', acts: [ { a: 'STORE' } ] },
    { c: '8', acts: [ { a: 'STORE' } ] },
    { c: '9', acts: [ { a: 'STORE' } ] },
    { c: ';', acts: [ { a: 'STORE' } ] },
    { c: 'n', acts: [ { a: 'CALL', b: _devstat }, { a: 'STATE', b: 'REST' } ] },
    { c: 'R', acts: [ { a: 'CALL', b: _curpos }, { a: 'STATE', b: 'REST' } ] },
    { c: 'A', acts: [ { a: 'EMIT', b: 'up' }, { a: 'STATE', b: 'REST' } ] },
    { c: 'B', acts: [ { a: 'EMIT', b: 'down' }, { a: 'STATE', b: 'REST' } ] },
    { c: 'C', acts: [ { a: 'EMIT', b: 'right' }, { a: 'STATE', b: 'REST' } ] },
    { c: 'D', acts: [ { a: 'EMIT', b: 'left' }, { a: 'STATE', b: 'REST' } ] },
  ]
};

function _up(self) { self.debug('UP'); }
function _down(self) { self.debug('DOWN'); }
function _right(self) { self.debug('RIGHT'); }
function _left(self) { self.debug('LEFT'); }

function _ldon(self) {
  if (self.linedraw === LINEDRAW_VT100)
    self.write(ESC + '(0');
}
function _ldoff(self) {
  if (self.linedraw === LINEDRAW_VT100)
    self.write(ESC + '(B');
}

function _curpos(self)
{
  var x = self._store.split(/;/);
  self.debug('CURSOR POSITION: ' + x[0] + ', ' + x[1]);
  self.emit('position', x[0], x[1]);
  self._store = '';
}

function _devstat(self)
{
  self.debug('DEVICE STATUS: ' + self._store);
  self._store = '';
}

function _ptt(parsetable, state, c)
{
  var pte = parsetable[state];
  if (!pte) throw new Error('unknown state');

  var dptt = null;
  for (var i = 0; i < pte.length; i++) {
    var ptt = pte[i];
    if (ptt.hasOwnProperty('c')) {
      if (typeof (ptt.c) === 'string')
        ptt.c = ptt.c.charCodeAt(0);
      if (ptt.c === c)
        return ptt;
    } else {
      dptt = ptt;
    }
  }
  if (dptt === null)
    throw new Error('could not find transition from ' + state +
      ' for ' + c);
  return (dptt);
}

function _procbuf(self)
{
  if (self._pos >= self._buf.length)
    return;

  if (self._timeout)
    clearTimeout(self._timeout);
  self._timeout = null;

  var c = (self._buf[self._pos]);
  var ptt = _ptt(parsetable, self._state, c);

  self.debug('CHAR: ' + c);

  ptt.acts.forEach(function(act) {
    switch (act.a) {
    case 'STATE':
      self.debug('STATE: ' + self._state + ' -> ' + act.b);
      self._state = act.b;
      break;
    case 'TIMEOUT':
      self.debug('TIMEOUT: ' + act.e);
      if (self._timeout)
        clearTimeout(self._timeout);
      self._timeout = setTimeout(function() {
        self.emit(act.e);
        self._state = 'REST';
      }, 50);
      break;
    case 'EMIT':
      self.debug('EMIT: ' + act.b);
      if (act.d && self.listeners(act.b).length < 1) {
        self.clear();
        self.moveto(1, 1);
        self.write('terminated (' + act.b + ')\n');
        process.exit(1);
      }
      if (act.c)
        self.emit(act.b, c);
      else
        self.emit(act.b);
      break;
    case 'STORE':
      var sc = String.fromCharCode(c);
      self.debug('STORE: ' + sc);
      self._store += sc;
      break;
    case 'RESET':
      self.debug('RESET');
      self._store = '';
      break;
    case 'CALL':
      self.debug('CALL: ' + act.b.name);
      act.b(self);
      break;
    default:
      throw new Error('unknown action ' + act.a);
    }
  });
  self._pos++;

  process.nextTick(function() { _procbuf(self); });
}

function ANSITerm()
{
  events.EventEmitter.call(this);
  var self = this;

  self._pos = 0;
  self._state = 'REST';
  self._buf = new Buffer(0);
  self._store = '';
  self._in = process.stdin; // XXX
  self._out = process.stdout; // XXX
  self._err = process.stderr; // XXX
  self._ldcount = 0;

  self.linedraw = LINEDRAW_VT100;
  //if (process.env.LANG && process.env.LANG.match(/[uU][tT][fF]-?8$/))
   // self.linedraw = LINEDRAW_UTF8;

  if (!self._in.isTTY || !self._out.isTTY)
    throw new Error('not a tty');

  if (!process.env.TERM || process.env.TERM === 'dumb')
    throw new Error('not a useful terminal');

  self._in.on('data', function(data) {
    var x = self._buf;
    self._buf = new Buffer(self._buf.length + data.length);
    x.copy(self._buf);
    data.copy(self._buf, x.length);
    process.nextTick(function() { _procbuf(self); });
  });
  self._in.setRawMode(true);
  self._in.resume();

  self.debug = function at_debug(str) {
    return;
    self._err.write(str + '\n');
  };
  self.logerr = function at_logerr(str) {
    self._err.write(str + '\n');
  };
  self.clear = function at_clear() {
    self._out.write('\u001b[2J');
  };
  self.moveto = function at_moveto(x, y) {
    if (x < 0)
      x = self._out.columns + x + 1;
    if (y < 0)
      y = self._out.rows + y + 1;
    self._out.write(CSI + y + ';' + x + 'f');
  };
  self.write = function at_write(str) {
    self._out.write(str);
  };
  self.cursor = function at_cursor(curs) {
    self._out.write(CSI + '?25' + (curs ? 'h' : 'l'));
  };
  self.bold = function at_reverse() {
    self._out.write(CSI + '1m');
  };
  self.reverse = function at_reverse() {
    self._out.write(CSI + '7m');
  };
  self.colour256 = function at_colour256(num, bg) {
    if (bg) {
      self._out.write(CSI + '48;5;' + num + 'm');
    } else {
      self._out.write(CSI + '38;5;' + num + 'm');
    }
  };
  self.reset = function at_reset() {
    self._out.write(CSI + 'm');
  };
  self.eraseLine = function at_eraseLine() {
    self._out.write(CSI + '2K');
  };
  self.eraseStartOfLine = function at_eraseStartOfLine() {
    self._out.write(CSI + '1K');
  };
  self.eraseEndOfLine = function at_eraseEndOfLine() {
    self._out.write(CSI + 'K');
  };
  self.insertMode = function at_insertMode() {
    self._out.write(CSI + '4h');
  };
  self.replaceMode = function at_replaceMode() {
    self._out.write(CSI + '4l');
  };
  self.drawHorizontalLine = function at_drawHorizontalLine(y, xfrom, xto) {
    if (typeof (xfrom) !== 'number') xfrom = 1;
    if (typeof (xto) !== 'number') xto = self._out.columns;
    self.moveto(xfrom, y);
    self.enableLinedraw();
    if (false) {
      self.write(self.linedraw.horiz + CSI + (xto - xfrom) + 'b');
    } else {
      var s = ''; for (var i = 0; i <= (xto - xfrom); i++) s += self.linedraw.horiz;
      self.write(s);
    }
    self.disableLinedraw();
  };
  self.drawVerticalLine = function at_drawVerticalLine(x, yfrom, yto) {
    if (typeof (yfrom) !== 'number') yfrom = 1;
    if (typeof (yto) !== 'number') yto = self._out.rows;
    self.moveto(x, yfrom);
    self.enableLinedraw();
    for (var p = yfrom; p <= yto; p++) {
      self.write(self.linedraw.verti + CSI + 'B' + CSI + x + 'G'); // draw verti, move down
    }
    self.disableLinedraw();
  };
  self.drawBox = function at_drawBox(x1, y1, x2, y2) {
    if (typeof (x1) !== 'number') x1 = 1;
    if (typeof (y1) !== 'number') y1 = 1;
    if (typeof (x2) !== 'number') x2 = self._out.columns;
    if (typeof (y2) !== 'number') y2 = self._out.rows;
    var horizl = '';
    for (var p = x1 + 1; p <= x2 - 1; p++)
      horizl += self.linedraw.horiz;
    self.enableLinedraw();
    self.moveto(x1, y1);
    self.write(self.linedraw.topleft + horizl + self.linedraw.topright);
    self.moveto(x1, y2);
    self.write(self.linedraw.bottomleft + horizl + self.linedraw.bottomright);
    self.drawVerticalLine(x1, y1 + 1, y2 - 1);
    self.drawVerticalLine(x2, y1 + 1, y2 - 1);
    self.disableLinedraw();
  };
  self.doubleHeight = function at_doubleHeight(x, y, str) {
    self.moveto(x, y);
    self.write(ESC + '#3' + str);
    self.moveto(x, y + 1);
    self.write(ESC + '#4' + str);
  };
  self.disableLinedraw = function at_disableLinedraw() {
    if (self._ldcount === 0) return;
    self._ldcount--;
    if (self._ldcount === 0) _ldoff(self);
  };
  self.enableLinedraw = function at_enableLinedraw() {
    if (self._ldcount === 0) _ldon(self);
    self._ldcount++;
  };
  self.size = function at_size() {
    return { h: self._out.rows, w: self._out.columns };
  };
  self.softReset = function at_softReset() {
    self.cursor(true);
    self.replaceMode();
    self.reset();
  };
  process.on('SIGWINCH', function() { self.emit('resize', self.size()) });
  process.on('exit', function(err) { self.softReset(); });
}
util.inherits(ANSITerm, events.EventEmitter);

exports.ANSITerm = ANSITerm;
