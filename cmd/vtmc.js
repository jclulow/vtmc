#!/usr/bin/env node
/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_fs = require('fs');
var mod_path = require('path');

var mod_extsprintf = require('extsprintf');
var mod_ansiterm = require('ansiterm');

var sprintf = mod_extsprintf.sprintf;

var DECKDIR;

var DECK;
var CURFILE;
var SLIDE;

var TERM;
var LIGHT = false;

var INTENSITY = 232;
var IMAX = 255;
var IMIN = 232;

var BLUE_RAMP = [ 17, 17, 17, 18, 18, 19, 19, 20, 20, 21, 27, 32, 33,
    38, 39, 44, 45, 45, 81, 81, 51, 51, 123, 123 ];

var WORKING = false;
var ANIM;

function
load_deck()
{
	var file = mod_path.join(DECKDIR, 'deck.json');
	var str = mod_fs.readFileSync(file, 'utf8');
	var deck = JSON.parse(str);

	/*
	 * Allow for international spellings of configuration:
	 */
	if (deck.header && deck.header.center) {
		deck.header.centre = deck.header.center;
		delete deck.header.center;
	}
	if (deck.footer && deck.footer.center) {
		deck.footer.centre = deck.footer.center;
		delete deck.footer.center;
	}

	return (deck);
}

function
list_files()
{
	var ents = mod_fs.readdirSync(DECKDIR);
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
write_text(text, blue, intensity)
{
	TERM.colour256(blue ? blue_ramp(intensity) : intensity);
	TERM.write(text);
}

function
write_heading(text, intensity, voffset)
{
	var toffset = Math.round(TERM.size().w / 2 - text.length / 2);

	TERM.moveto(1 + toffset, voffset);
	write_text(text, true, intensity);
}

function
write_line(line, intensity, offset, voffset)
{
	var blue_on = false;
	var escape = false;
	var partial = '';

	if (line[0] === '%') {
		write_heading(line.substr(1).trim(), intensity, voffset);
		return;
	}

	TERM.moveto(offset, voffset);

	for (var i = 0; i < line.length; i++) {
		var c = line[i];

		if (escape) {
			partial += c;
			continue;
		}

		switch (c) {
		case '\\':
			escape = true;
			break;
		case '~':
			if (partial.length > 0) {
				write_text(partial, blue_on, intensity);
				partial = '';
			}
			blue_on = !blue_on;
			break;
		default:
			partial += c;
			break;
		}
	}

	if (partial.length > 0)
		write_text(partial, blue_on, intensity);
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

	var offset = slide.props.centre ?
	    Math.round(TERM.size().w / 2 -
	    slide.maxwidth / 2) : 0;

	var voffset = slide.props.vcentre ?
	    Math.round((TERM.size().h - 2) / 2 -
	    slide.lines.length / 2) + 2 : 2;

	clearInterval(ANIM);
	ANIM = setInterval(function() {

		for (var i = 0; i < slide.lines.length; i++) {
			write_line(slide.lines[i], INTENSITY,
			    1 + offset, voffset + i);
		}

		if (LIGHT) {
			if ((!out && INTENSITY <= IMIN) ||
			    (out && INTENSITY >= IMAX)) {
				clearInterval(ANIM);
				ANIM = null;
				callback();
				return;
			}
			INTENSITY += out ? 1 : -1;
		} else {
			if ((out && INTENSITY <= IMIN) ||
			    (!out && INTENSITY >= IMAX)) {
				clearInterval(ANIM);
				ANIM = null;
				callback();
				return;
			}
			INTENSITY += out ? -1 : 1;
		}
	}, delay);
}

function
text_left(text, row)
{
	if (!text)
		return;

	TERM.moveto(3, row);
	TERM.write(text);
}

function
text_right(text, row)
{
	if (!text)
		return;

	TERM.moveto(-3 - text.length, row);
	TERM.write(text);
}

function
text_centre(text, row)
{
	if (!text)
		return;

	TERM.moveto(Math.round(TERM.size().w / 2 - text.length / 2), row);
	TERM.write(text);
}

function
draw_surrounds()
{
	var row;

	TERM.colour256(208); /* XXX maybe people don't just want orange? */

	do_one('header', 1);
	do_one('footer', -1);

	function do_one(key, row) {
		if (!DECK[key])
			return;

		text_left(DECK[key].left, row);
		text_right(DECK[key].right, row);
		text_centre(DECK[key].centre, row);
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
parse_properties(propsline)
{
	var out = {};
	var new_props = propsline.trim().split(/\s+/);
	for (var i = 0; i < new_props.length; i++) {
		var new_prop = new_props[i];

		/*
		 * Allow for international spellings of properties:
		 */
		switch (new_prop) {
		case 'center':
			new_prop = 'centre';
			break;
		case 'vcenter':
			new_prop = 'vcentre';
			break;
		}

		out[new_prop] = true;
	}
	return (out);
}

function
switch_slide(name, callback)
{
	var new_slide;
	var new_props;

	if (!name) {
		if (callback)
			setImmediate(callback);
		return;
	}

	if (!callback)
		callback = function () {};

	try {
		new_slide = {
			text: mod_fs.readFileSync(mod_path.join(DECKDIR,
			    name), 'utf8'),
			maxwidth: 0,
			props: {}
		};
		new_slide.lines = new_slide.text.split(/\n/);
		new_slide.props = parse_properties(new_slide.lines.shift());
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

		var text = mod_fs.readFileSync(mod_path.join(DECKDIR,
		    file), 'utf8');

		var lines = text.split(/\n/);
		lines.shift();

		maxh = Math.max(lines.length, maxh);
		var lw = max_line_width(text);
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

			var end = function () {
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
			}
		});
}

/*
 * Main program:
 */

function
main(argv)
{
	var command = argv[0];

	if (command !== 'show' && command !== 'shine' && command !== 'size') {
		console.error('Usage: vtmc COMMAND [DIRECTORY]');
		console.error('');
		console.error('Commands:');
		console.error('');
		console.error('     show     present slideshow');
		console.error('     shine    present slideshow on white background');
		console.error('     size     measure required terminal ' +
		    'size for deck');
		console.error('');
		console.error('Directory:');
		console.error('');
		console.error('     If not specified, the current ' +
		    'working directory will be used.');
		console.error('');
		console.error('Control Keys:');
		console.error('');
		console.error('     j        next slide');
		console.error('     k        previous slide');
		console.error('     r        reload current slide');
		console.error('     q        quit');
		console.error('');
		process.exit(1);
	}

	DECKDIR = argv[1] ? argv[1] : process.cwd();
    
	try {
		DECK = load_deck();
	} catch (ex) {
		console.error('ERROR: could not load slide deck: %s',
		    ex.message);
		process.exit(5);
	}

	if (argv[0] === 'show') {
		setup_terminal();
		check_size(TERM.size());
	} else if (argv[0] === 'shine') {
		LIGHT = true;
		INTENSITY = 255;
		setup_terminal();
		check_size(TERM.size());
	} else {
		console.log('slide size report:');
		console.log('');
		var bounds = find_bounds(true);
		console.log('');
		console.log(sprintf('required:  %3d x %3d', bounds.w,
		    bounds.h));
		console.log(sprintf('current:   %3d x %3d',
		    process.stdout.columns, process.stdout.rows));
		process.exit(0);
	}
}

main(process.argv.slice(2));
