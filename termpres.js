#!/usr/bin/env node
/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_fs = require('fs');
var mod_path = require('path');

var mod_ansiterm = require('./lib/ansiterm');

var TERM = new mod_ansiterm.ANSITerm();

var TITLE = 'Node.js In Production At Joyent';
var FOOTL = 'Joshua M. Clulow';
var FOOTR = '\u2295 Joyent';

var SLIDE;
var MAXWIDTH;

console.log(SLIDE);

function
spin(num)
{
	var xx = 0;
	for (var i = 0; i < num; i++) {
		xx += 1;
	}
	return (xx);
}

var TOTES = 0;
TERM.clear();
TERM.cursor(false);
/*
for (var i = 0; i < SLIDE.length; i++) {
	var line = SLIDE[i];
*/

function
fade(text, out, callback)
{
	var dir = out ? -1 : 1;
	var from = out ? 255 : 232;
	var to = out ? 232 : 255;

	var offset = Math.round(TERM.size().w / 2 - MAXWIDTH / 2);

	var j = from;
	var int = setInterval(function() {
	//TERM.moveto(1, 2);
	//TERM.write('maxw: ' + MAXWIDTH + '  offset: ' + offset + '  j: ' + j);
		TERM.colour256(j);

		var LL = text.split('\n');
		for (var ll = 0; ll < LL.length; ll++) {
			TERM.moveto(1 + offset, 2 + ll);
			TERM.write(LL[ll]);
		}

		if (j === to) {
			clearInterval(int);
			callback();
		} else {
			j += dir;
		}
	}, 50);
}

function
draw_surrounds()
{
	TERM.colour256(208);
	TERM.moveto(Math.round(TERM.size().w / 2 - TITLE.length / 2), 1);
	TERM.write(TITLE);

	TERM.moveto(3, -1);
	TERM.write(FOOTL);
	TERM.moveto(-3 - FOOTR.length, -1);
	TERM.write(FOOTR);
}




function
display_slide(text, callback)
{
	TERM.clear();
	draw_surrounds();

	fade(text, false, function () {
		setTimeout(function () {
			fade(text, true, function () {
				TERM.clear();
				callback();
			});
		}, 3000);
	});
}

function
max_line_width(text)
{
	var lines = text.split(/\n/);
	var max = 1;
	for (var i = 0; i < lines.length; i++) {
		var line = lines[i].trimRight();
		max = Math.max(max, line.length);
	}
	return (max);
}

var IDX = 0;
function
display_all_slides()
{
	try {
		SLIDE = mod_fs.readFileSync(mod_path.join(__dirname,
		    'slides', String(IDX++)), 'utf8');
		MAXWIDTH = max_line_width(SLIDE);
	} catch (ex) {
		TERM.clear();
		process.exit(0);
	}

	display_slide(SLIDE, display_all_slides);
}


display_all_slides();
