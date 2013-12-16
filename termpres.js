#!/usr/bin/env node
/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_fs = require('fs');
var mod_path = require('path');

var mod_ansiterm = require('./lib/ansiterm');

var TERM = new mod_ansiterm.ANSITerm();

var TITLE = 'Node.js In Production At Joyent';
var FOOTL = 'Joshua M. Clulow';
var FOOTR = '\u2295 Joyent';

var FADE_DELAY = 15;

var SLIDE;

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

var INTENSITY = 232;
var IMAX = 255;
var IMIN = 232;

var ANIM;

function
fade(slide, out, callback)
{
	//var from = out ? 255 : 232;
	//var to = out ? 232 : 255;

	if (!slide) {
		callback();
		return;
	}

	var offset = slide.props.centre ? Math.round(TERM.size().w / 2 -
	    slide.maxwidth / 2) : 0;

	var voffset = slide.props.vcentre ? Math.floor(TERM.size().h / 2 -
	    2 - slide.lines.length / 2) + 2: 2;

	clearInterval(ANIM);
	ANIM = setInterval(function() {
		TERM.colour256(INTENSITY);

		for (var ll = 0; ll < slide.lines.length; ll++) {
			TERM.moveto(1 + offset, voffset + ll);
			TERM.write(slide.lines[ll]);
		}

		if ((out && INTENSITY <= IMIN) ||
		    (!out && INTENSITY >= IMAX)) {
			clearInterval(ANIM);
			ANIM = null;
			callback();
		} else {
			INTENSITY += out ? -1 : 1;
		}
	}, FADE_DELAY);
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

/*
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
*/

function
switch_slide(idx, callback)
{
	var new_slide;

	if (!callback)
		callback = function () {};

	try {
		var new_slide = {
			text: mod_fs.readFileSync(mod_path.join(__dirname,
			    'slides', String(idx)), 'utf8'),
			maxwidth: 0,
			props: {}
		};
		new_slide.lines = new_slide.text.split(/\n/);
		var new_props = new_slide.lines.shift().trim().split(/\s+/);
		for (var i = 0; i < new_props.length; i++) {
			new_slide.props[new_props[i]] = true;
		}
		new_slide.maxwidth = max_line_width(new_slide.text);
	} catch (ex) {
		callback(ex);
		return;
	}
	fade(SLIDE, true, function () {
		SLIDE = new_slide;
		IDX = idx;

		TERM.clear();
		draw_surrounds();

		fade(SLIDE, false, function () {
			callback();
		});
	});
}

var WORKING = false;

TERM.on('keypress', function (key) {
	if (key === 'q'.charCodeAt(0)) {
		TERM.clear();
		TERM.moveto(1, 1);
		process.exit(0);
	}

	if (WORKING)
		return;
	WORKING = true;

	var printstuff = function (stuff) {
		return;
		stuff = String(stuff);
		TERM.moveto(-stuff.length, -2);
		TERM.write(stuff);
	};

	var end = function () {
		printstuff('IDX ' + IDX + ' @ ' + new Date().toISOString());
		WORKING = false;
	};

	if (key === 'j'.charCodeAt(0)) {
		switch_slide(IDX + 1, end);
	} else if (key === 'k'.charCodeAt(0)) {
		if (IDX > 0)
			switch_slide(IDX - 1, end);
		else
			end();
	} else if (key === 'r'.charCodeAt(0)) {
		switch_slide(IDX, end);
	} else {
		end();
		printstuff('fallthrough ' + key);
	}
});

function
find_bounds()
{
	var maxw = 0;
	var maxh = 0;

	var i = 0;
	for (;;) {
		try {
			var text = mod_fs.readFileSync(mod_path.join(
			    __dirname, 'slides', String(i++)), 'utf8');
			var lines = text.split(/\n/);
			lines.shift();
			maxh = Math.max(lines.length, maxh);
			maxw = Math.max(max_line_width(text), maxw);
		} catch (ex) {
			break;
		}
	}
	return ({
		h: maxh,
		w: maxw
	});
}

function
check_size(size)
{
	TERM.clear();
	WORKING = true;
	if (ANIM) {
		clearInterval(ANIM);
		ANIM = null;
	}
	var bounds = find_bounds();
	if (bounds.w >= size.w || bounds.h >= size.h - 3) {
		var msg = '(' + bounds.w + ',' + bounds.h + ') < ' +
		    '(' + size.w + ',' + (size.h - 3) + ')!';
		TERM.clear();
		TERM.moveto(Math.floor(size.w / 2 - msg.length / 2),
		    Math.floor(size.h / 2));
		TERM.colour256(196);
		TERM.write(msg);
	} else {
		switch_slide(IDX, function (err) {
			if (err) {
				TERM.clear();
				TERM.write(err.stack);
				process.exit(1);
			}
			WORKING = false;
		});
	}
}

TERM.on('resize', check_size);


var IDX = 0;

/*
 * Switch to first slide, or die trying:
 */
/*
switch_slide(IDX, function (err) {
	if (err) {
		TERM.clear();
		TERM.write(err.stack);
		process.exit(1);
	}
});
*/

check_size(TERM.size());
