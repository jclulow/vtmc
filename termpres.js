#!/usr/bin/env node
/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_fs = require('fs');
var mod_path = require('path');

var mod_extsprintf = require('extsprintf');
var mod_ansiterm = require('ansiterm');

var sprintf = mod_extsprintf.sprintf;


var TERM;

var DECK;

var SLIDE;


var INTENSITY = 232;
var IMAX = 255;
var IMIN = 232;

var BLUE_RAMP = [ 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 27, 32, 33,
    38, 39, 44, 45, 45, 81, 81, 51, 51, 123, 123 ];


var WORKING = false;
var ANIM;


function
load_deck()
{
	var file = mod_path.join(__dirname, 'slides', 'deck.json'); /* XXX */
	var str = mod_fs.readFileSync(file, 'utf8');

	return (JSON.parse(str));
}

var CURFILE;

function
list_files()
{
	var dir = mod_path.join(__dirname, 'slides'); /* XXX */
	var ents = mod_fs.readdirSync(dir);
	var out = [];

	for (var i = 0; i < ents.length; i++) {
		var ent = ents[i];

		if (ent.match(/\.txt$/))
			out.push(ent);
	}

	out.sort();

	return (out);
}

function
prev_file()
{
	var files = list_files();

	if (!files || files.length < 1)
		return (null);

	if (!CURFILE)
		return (files[0]);

	var idx = files.indexOf(CURFILE);
	if (idx === -1) {
		return (files[0]);
	}

	/*
	 * If we're already on the last slide, don't advance.
	 * Also do not advance _past_ zero.
	 */
	if (idx === 0 || idx - 1 < 0)
		return (null);

	return (files[idx - 1]);
}

function
next_file()
{
	var files = list_files();

	if (!files || files.length < 1)
		return (null);

	if (!CURFILE)
		return (files[0]);

	var idx = files.indexOf(CURFILE);
	if (idx === -1)
		return (files[0]);

	if (idx === files.length - 1 || idx + 1 > files.length)
		return (null);

	return (files[idx + 1]);
}


function
blue_ramp(ival)
{
	return (BLUE_RAMP[ival - IMIN]);
}

function
fade(slide, out, callback)
{
	var delay = 15;
	if (DECK.fade && DECK.fade.delay)
		delay = DECK.fade.delay;

	if (!slide) {
		callback();
		return;
	}

	var offset = slide.props.centre ? Math.round(TERM.size().w / 2 -
	    slide.maxwidth / 2) : 0;

	var voffset = slide.props.vcentre ? Math.round((TERM.size().h - 2) / 2 -
	    slide.lines.length / 2) + 2: 2;

	clearInterval(ANIM);
	ANIM = setInterval(function() {

		for (var ll = 0; ll < slide.lines.length; ll++) {
			var lll = slide.lines[ll];
			var m = lll.match(/^([%]?)\s*(.*)\s*/);
			if (m[1] === '%') {
				var toffset = Math.round(TERM.size().w / 2 -
				    m[2].length / 2);
				TERM.colour256(blue_ramp(INTENSITY));
				TERM.moveto(1 + toffset, voffset + ll);
				TERM.write(m[2]);
			} else {
				TERM.moveto(1 + offset, voffset + ll);

				var blue_on = false;
				var segs = lll.split('~');
				for (var k = 0; k < segs.length; k++) {
					TERM.colour256(blue_on ?
					    blue_ramp(INTENSITY) :
					    INTENSITY);
					TERM.write(segs[k]);
					blue_on = !blue_on;
				}
			}

		}

		if ((out && INTENSITY <= IMIN) ||
		    (!out && INTENSITY >= IMAX)) {
			clearInterval(ANIM);
			ANIM = null;
			callback();
		} else {
			INTENSITY += out ? -1 : 1;
		}
	}, delay);
}

function
text_left(text, row)
{
	TERM.moveto(3, row);
	TERM.write(text);
}

function
text_right(text, row)
{
	TERM.moveto(-3 - text.length, row);
	TERM.write(text);
}

function
text_centre(text, row)
{
	TERM.moveto(Math.round(TERM.size().w / 2 - text.length / 2), row);
	TERM.write(text);
}

function
draw_surrounds()
{
	var row;

	TERM.colour256(208); /* XXX maybe people don't just want orange? */


	if (DECK.header) {
		row = 1;
		if (DECK.header.left)
			text_left(DECK.header.left, row);
		if (DECK.header.right)
			text_right(DECK.header.right, row);
		var ctr = DECK.header.centre || DECK.header.center;
		if (ctr)
			text_centre(ctr, row);
	}

	if (DECK.footer) {
		row = -1;
		if (DECK.footer.left)
			text_left(DECK.footer.left, row);
		if (DECK.footer.right)
			text_right(DECK.footer.right, row);
		var ctr = DECK.footer.centre || DECK.footer.center;
		if (ctr)
			text_centre(ctr, row);
	}
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

function
switch_slide(name, callback)
{
	var new_slide;

	if (!name) {
		if (callback)
			setImmediate(callback);
		return;
	}

	if (!callback)
		callback = function () {};

	try {
		var new_slide = {
			text: mod_fs.readFileSync(mod_path.join(__dirname,
			    'slides', name), 'utf8'),
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
		CURFILE = name;

		TERM.clear();
		draw_surrounds();

		fade(SLIDE, false, function () {
			callback();
		});
	});
}

function
find_bounds(print_each)
{
	var maxw = 0;
	var maxh = 0;

	var files = list_files();

	for (var i = 0; i < files.length; i++) {
		var file = files[i];

		var text = mod_fs.readFileSync(mod_path.join(__dirname,
		    'slides', file), 'utf8');

		var lines = text.split(/\n/);
		lines.shift();

		maxh = Math.max(lines.length, maxh);
		var lw = max_line_width(text)
		maxw = Math.max(lw, maxw);

		if (print_each) {
			console.log(sprintf('   %-25s   %3d x %3d', file, lw,
			    lines.length));
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
		/*
		 * Pick an initial slide if we have not yet done so:
		 */
		if (!CURFILE)
			CURFILE = next_file();

		switch_slide(CURFILE, function (err) {
			if (err) {
				TERM.clear();
				TERM.write(err.stack);
				process.exit(1);
			}
			WORKING = false;
		});
	}
}

function
setup_terminal()
{
		TERM = new mod_ansiterm.ANSITerm();

		TERM.clear();
		TERM.cursor(false);
		TERM.on('resize', check_size);

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
				if (!process.env.DEBUG)
					return;

				stuff = String(stuff);
				TERM.moveto(-stuff.length, -2);
				TERM.write(stuff);
			};

			var end = function () {
				printstuff('FILE ' + CURFILE + ' @ ' + new Date().toISOString());
				WORKING = false;
			};

			if (key === 'j'.charCodeAt(0)) {
				switch_slide(next_file(), end);
			} else if (key === 'k'.charCodeAt(0)) {
				switch_slide(prev_file(), end);
			} else if (key === 'r'.charCodeAt(0)) {
				switch_slide(CURFILE, end);
			} else {
				setImmediate(end);
				printstuff('fallthrough ' + key);
			}
		});
}

/*
 * Main program:
 */

function
main(argv)
{
	DECK = load_deck();

	if (argv[0] === 'show') {
		setup_terminal();
		check_size(TERM.size());

	} else if (argv[0] == 'size') {
		console.log('slide size report:');
		console.log('');
		var bounds = find_bounds(true);
		console.log('');
		console.log(sprintf('required:  %3d x %3d', bounds.w, bounds.h));
		console.log(sprintf('current:   %3d x %3d', process.stdout.columns,
		    process.stdout.rows));
		process.exit(0);

	} else {
		console.error('Usage: mcterm [command] ...');
		console.error('');
		console.error('     show     present slideshow');
		console.error('     size     measure required terminal size for deck');
		console.error('');
		process.exit(1);

	}
}

main(process.argv.slice(2));
