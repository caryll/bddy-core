"use strict";

const { file, dir, anyfile } = require("./lib/targets/file");
const { virt, anyvirt } = require("./lib/targets/virtual");

// constructors for targets, "the"
exports.The = fn => ({
	file: fn(file),
	dir: fn(dir),
	virt: fn(virt)
});

// constructors for cotargets, "a"
exports.A = fn => ({
	file: fn(anyfile),
	virt: fn(anyvirt)
});
