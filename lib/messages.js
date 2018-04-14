"use strict";

const colors = require("colors/safe");

exports.DIAMOND = colors.blue("♦");
exports.FAILURE = colors.red("×");
exports.LOG = colors.gray("·");
exports.kind = colors.cyan;
exports.highlight = s => colors.bold(colors.white(s));
exports.dimm = colors.gray;
exports.objective = colors.green;

function normalizeSeg(s) {
	if (!s) return null;
	if (typeof s === "string") return { style: s => s, raw: s };
	return s;
}
function fillWindow(s, l) {
	if (s.length < l) {
		while (s.length < l) s += " ";
		return s;
	}
	if (s.length <= l) return s;
	if (l > 6) {
		return s.slice(0, l - 3) + "...";
	} else if (l > 0) {
		return s.slice(0, l);
	} else {
		return "";
	}
}
exports.stretMessage = function(left, flexible, right) {
	left = left.filter(x => x).map(normalizeSeg);
	right = right.filter(x => x).map(normalizeSeg);
	const spaces = 3 + left.length + right.length;
	const flexibleLength =
		process.stderr.columns - spaces - [...left, ...right].reduce((a, b) => a + b.raw.length, 0);

	return [
		...left.map(a => a.style(a.raw)),
		exports.dimm(fillWindow(flexible, flexibleLength)),
		...right.map(a => a.style(a.raw))
	];
};
