"use strict";

const Context = require("./lib/rootctx");
const { A, The } = require("./athe");

exports._bddy = function() {
	return new Context();
};

class BuildFunctionSet {
	constructor(context, coTFn, args) {
		this.context = context;
		this.coTFn = coTFn;
		this.args = args;
	}
	def(f) {
		return this.context.def(this.coTFn(...this.args), f);
	}
	from(f) {
		return this.def(f);
	}
	alsodir() {
		new BuildFunctionSet(this.context, aConfig.file, [
			this.args[0].replace(/[/\\][^/\\]+$/, "")
		]).def(this.context.ensureDir);
		return this;
	}
}
const BuildEntryT = (ctx, coTFn) => (...args) => new BuildFunctionSet(ctx, coTFn, args);

//predefs
const existingFile = require("./lib/predefs/existingFile");
const Verda = require("./lib/plugins/verda");
const Command = require("./lib/plugins/command");
const VCall = require("./lib/plugins/vcall");
const Dir = require("./lib/plugins/dir");
const FileOps = require("./lib/plugins/fileops");

exports.bddy = function(defs, argv, _options) {
	const options = Object.assign({}, _options);
	const r = new Context();
	r.resources.options = Object.assign({}, r.resources.options, options);

	r.loadDefinitions(existingFile);
	r.loadPlugin({ verda: new Verda(options) });
	r.loadPlugin({
		command: new Command(),
		dir: new Dir(),
		fileops: new FileOps(),
		vcall: new VCall()
	});

	const a = A(CoTarget => BuildEntryT(r, CoTarget));
	const the = The(Target => Target);

	if (defs) {
		defs.call(r, r, a, the, argv, exports);
	}
	return r;
};
