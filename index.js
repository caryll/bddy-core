const Context = require("./lib/rootctx");
const { file, present, anyfile } = require("./lib/targets/file");
const { virt, anyvirt } = require("./lib/targets/virtual");

const aConfig = {
	file: anyfile,
	virt: anyvirt
};

const theConfig = { file, virt };

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
const Dir = require("./lib/plugins/dir");
const FileOps = require("./lib/plugins/fileops");

exports.bddy = function(defs, argv, _options) {
	const options = Object.assign({}, _options);
	const r = new Context();
	r.loadDefinitions(existingFile);
	r.loadPlugin({ verda: new Verda(options) });
	r.loadPlugin({ command: new Command(), dir: new Dir(), fileops: new FileOps() });

	const a = {};
	for (let type in aConfig) {
		a[type] = BuildEntryT(r, aConfig[type]);
	}

	const the = {};
	for (let type in theConfig) {
		the[type] = theConfig[type];
	}

	if (defs) {
		defs.call(r, r, a, the, argv, exports);
	}
	return r;
};
