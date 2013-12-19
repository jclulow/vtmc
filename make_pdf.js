#!/usr/bin/env node
/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_path = require('path');
var mod_fs = require('fs');
var mod_pdfkit = require('pdfkit');


var TITLE = 'Node.js In Production At Joyent';
var FOOTL = 'Joshua M. Clulow';
var FOOTR = '\u2295 Joyent';

var SIZE_OPTS = {
	size: [ 640, 480 ],
	margins: {
		top: 0,
		bottom: 0,
		left: 0,
		right: 0
	}
};

var doc = new mod_pdfkit(SIZE_OPTS);

doc.info.Title = 'Node.js at Joyent: Engineering for Production';
doc.info.Author = FOOTL;

var W = doc.page.width;
var H = doc.page.height;

var fontpath = mod_path.join(__dirname, 'fonts', 'Inconsolata.ttf');
doc.registerFont('text', fontpath, 'Inconsolata');

function
reset_font()
{
	doc.font('text');
	doc.fontSize(18);
}
reset_font();

var FW = doc.widthOfString('J');
var FH = FW * 2.2;

var X = 2;
var Y = 2;
var WW = Math.floor(W / FW) - 1;
var WH = Math.floor(H / FH) - 1;

console.error('WW %d WH %d', WW, WH);

function
moveto(x, y)
{
	if (x < 0)
		x = WW + x;
	if (y < 0)
		y = WH + y;

	X = (x) * FW;
	Y = (y) * FH;
}

function
write(str)
{
	for (var i = 0; i < str.length; i++) {
		doc.text(str[i], X, Y);
		X += FW;
	}
}

function
maxwidth(lines)
{
	var max = 0;
	for (var i = 0; i < lines.length; i++) {
		max = Math.max(lines[i].length, max);
	}
	return (max);
}

function
sigh(text)
{
	var lines = text.split(/\n/);
	var props = lines.shift().trim().split(/\s+/);

	var offset = 0;
	var voffset = 2;

	if (props.indexOf('centre') !== -1) {
		offset = Math.round(WW / 2 - maxwidth(lines) / 2);
	}

	if (props.indexOf('vcentre') !== -1) {
		voffset = Math.round((WH - 2) / 2 - lines.length / 2) + 2;
	}

	for (var i = 0; i < lines.length; i++) {
		var l = lines[i];

		var m = l.match(/^([%])\s*(.*)\s*/);
		if (m) {
			if (m[1] === '%') {
				var toffset = Math.round(WW / 2 - m[2].length / 2);

				moveto(toffset, voffset + i);
				doc.fill('cyan');
				write(m[2]);
			}
		} else {
			moveto(offset, voffset + i);
			var blue_on = false;
			var ll = l.split(/[~]/);
			for (var j = 0; j < ll.length; j++) {
				if (blue_on)
					doc.fill('cyan');
				else
					doc.fill('white');
				write(ll[j]);
				blue_on = !blue_on;
			}
		}
	}
}

function
draw_surrounds()
{
	doc.fill('orange');
	moveto(Math.round(WW / 2 - TITLE.length / 2), 1);
	write(TITLE);

	moveto(3, -1);
	write(FOOTL);
	moveto(-3 - FOOTR.length, -1);
	write(FOOTR);
}

var FIRST = true;
var IDX = 0;
function
draw_slide()
{
	var text;
	try {
		text = mod_fs.readFileSync(mod_path.join(__dirname, 'slides',
		    String(IDX++)), 'utf8');
	} catch (ex) {
		doc.write('output.pdf');
		return;
	}

	if (!FIRST) {
		doc.addPage(SIZE_OPTS);
	}
	FIRST = false;

	doc.rect(0, 0, W, H).fill('black');

	reset_font();
	draw_surrounds();
	sigh(text);

	setImmediate(draw_slide());
}

draw_slide();
