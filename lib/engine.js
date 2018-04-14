"use strict";

const colors = require("colors/safe");
const messages = require("./messages");
const errors = require("./errors");
const fs = require("fs-extra");
const { Target } = require("./target");
const os = require("os");
const Throat = require("throat");

const PROBING = Symbol("probing");
const STARTED = Symbol("pending");
const COMPLETE = Symbol("complete");

class Recipe {
	constructor(cotarget, howtodo, ignoreError) {
		this.cotarget = cotarget;
		this.howtodo = howtodo;
	}
	async run(ctx, item) {
		try {
			await this.howtodo.call(ctx, item, ctx, this.cotarget);
		} catch (e) {
			if (!e.bddyIgnorable) {
				throw e;
			}
		}
	}
}

class Task {
	constructor(recipes, ctx, target) {
		this.target = target;
		this.state = PROBING;
		this.time = new Date();
		this.promise = this.findRecipe(recipes)
			.then(recipe => {
				const ctx1 = ctx.ctxTargeting(target);
				return this.start(recipe, ctx1, target);
			})
			.then(target.getUpdateTime.bind(target))
			.then(t => {
				const time = t || new Date();
				ctx.__fulfill(target, time);
				ctx.log("[FINISH]", "Target", "<" + target + ">", "Finished at", time);
				return Promise.resolve(target);
			});
	}
	async findRecipe(recipes) {
		for (let j = recipes.length - 1; j >= 0; j--) {
			const recipe = recipes[j];
			if (await recipe.cotarget.match(this.target)) {
				this.state = STARTED;
				return recipe;
			}
		}
		throw new errors.CannotFindRecipe(this.target);
	}
	start(recipe, ctx, target) {
		return recipe.run(ctx, target);
	}
}

class Definitions {
	constructor() {
		this.recipes = [];
	}
	def(cotarget, f) {
		this.recipes.push(new Recipe(cotarget, f));
		return this;
	}
	// An async function that returns a promise
	run(target, ctx) {
		// already started?
		const targetid = target.toIdentifier();
		if (ctx.tasks.has(targetid)) {
			const task = ctx.tasks.get(targetid);
			if (task.state !== COMPLETE) {
				return task.promise.then(Promise.resolve(target));
			} else {
				return Promise.resolve(target);
			}
		} else {
			const task = new Task(this.recipes, ctx, target);
			ctx.tasks.set(targetid, task);
			return task.promise.then(Promise.resolve(target));
		}
	}
}

// This mutex is used to prevent targets being created too fast
const wait = time => () => new Promise(resolve => setTimeout(() => resolve(null), time));
const targetDeriveMutex = Throat(4);

class Context {
	constructor() {
		this.definitions = new Definitions();
		this.chain = new Set();
		this.tasks = new Map();
		this.resources = { options: {} };
		this.plugins = {};
		this.stringToTargetCache = new Map();
	}
	loadDefinitions(F) {
		F.call(this.definitions, this.definitions);
		return this;
	}
	def(cotarget, f) {
		this.definitions.def(cotarget, f);
		return this;
	}
	__fulfill(target, time) {
		const targetid = target.toIdentifier();
		if (this.tasks.has(targetid) && this.tasks.get(targetid).state === COMPLETE) return;
		const task = this.tasks.get(targetid);
		task.state = COMPLETE;
		task.time = time || new Date();
	}
	ctxTargeting(target) {
		return new TargetContext(this, target);
	}
	toTarget(t) {
		if (t instanceof Target) return Promise.resolve(t);
		const ts = "" + t;
		if (this.stringToTargetCache.has(ts)) {
			return this.stringToTargetCache.get(ts).cotarget.createTargetFromString(ts);
		}

		const recipes = this.definitions.recipes;
		return async function() {
			for (let j = recipes.length - 1; j >= 0; j--) {
				let t1 = await recipes[j].cotarget.createTargetFromString(ts);
				if (t1 instanceof Target) {
					this.stringToTargetCache.set(ts, recipes[j]);
					return t1;
				}
			}
			throw new errors.CannotFindRecipe(t);
		}.call(this);
	}
	async wish(t) {
		let target = await this.toTarget(t);
		await this.definitions.run(target, this);
		return this;
	}
	loadPlugin(ps, ...args) {
		for (let pid in ps) {
			this.plugins[pid] = ps[pid];
			ps[pid].load(this, false, ...args);
		}
		return this;
	}
	message(...text) {
		if (this.resources.options.quiet) return;
		console.error(messages.DIAMOND, ...text);
	}
	log(...text) {
		if (this.resources.options.quiet) return;
		if (!this.resources.options.verbose) return;
		console.error(messages.LOG, ...text.map(s => colors.gray("" + s)));
	}
}
async function flatPreq(demand, obj) {
	if (!obj) {
		return { ret: null, targets: [] };
	} else if (typeof obj === "string") {
		const target = await demand.toTarget(obj);
		return { ret: target, targets: [target] };
	} else if (obj instanceof Target) {
		return { ret: obj, targets: [obj] };
	} else if (Array.isArray(obj)) {
		const terms = await Promise.all([...obj].map(item => flatPreq(demand, item)));
		return {
			ret: terms.map(x => x.ret),
			targets: [].concat.apply([], terms.map(x => x.targets))
		};
	} else {
		let answer = {
			ret: {},
			targets: []
		};
		let kvs = [];
		for (let j in obj) {
			kvs.push({ key: j, value: obj[j] });
		}
		await Promise.all(
			kvs.map(({ key, value }) =>
				flatPreq(demand, value).then(({ ret, targets }) => {
					answer.ret[key] = ret;
					answer.targets = answer.targets.concat(targets);
					return Promise.resolve(null);
				})
			)
		);
		return answer;
	}
}

class TargetContext extends Context {
	constructor(parent, target) {
		super();
		this.definitions = parent.definitions;
		this.target = target;
		this.tasks = parent.tasks;
		this.stringToTargetCache = parent.stringToTargetCache;
		this.chain = new Set(parent.chain);
		this.chain.add(target.toIdentifier());
		this.resources = Object.create(parent.resources);
		this.plugins = Object.create(parent.plugins);

		// inherit plugins
		for (let pid in this.plugins) {
			const plugin = this.plugins[pid];
			plugin.load(this, true);
		}

		this.log("[DERIVE]", "Target derived:", "<" + this.target + ">");
	}
	def() {
		throw new Error("Cannot define recipes in target-specific contexts.");
	}
	fulfill(time) {
		return super.__fulfill(this.target, time);
	}
	fail(why) {
		throw new errors.BuildFailure(this.target, why);
	}
	async _check(..._prerequisites) {
		let tasks = [];
		let prerequisites = _prerequisites.map(p => p.asPrerequisite(this.target));

		let n = 0;
		for (let p of prerequisites) {
			if (this.chain.has(p.toIdentifier())) {
				throw new errors.Circular(p);
			}
			const act = () => this.definitions.run(p, this);
			tasks.push(targetDeriveMutex(wait(0)).then(act));
			n++;
		}

		await Promise.all(tasks);

		let needUpdate = false;
		let latest = null;
		for (let p of prerequisites) {
			let status = this.tasks.get(p.toIdentifier());
			if (!status || status.state !== COMPLETE) throw new errors.Incomplete(p);
			needUpdate = needUpdate || (await this.target.needUpdate(status.time));
			latest = !latest || status.time > latest ? status.time : latest;
		}
		return { needUpdate, latest };
	}
	async wish(t) {
		return await this.check(t);
	}
	async check(...p) {
		const { ret: preqObj, targets: prerequisites } = await flatPreq(this, [...p]);
		let { needUpdate } = await this._check(...prerequisites);
		preqObj.needUpdate = needUpdate;
		return preqObj;
	}
	async need(...p) {
		const { ret: preqObj, targets: prerequisites } = await flatPreq(this, [...p]);
		let { needUpdate, latest } = await this._check(...prerequisites);
		if (!needUpdate) {
			this.__fulfill(this.target, await this.target.getUpdateTime(latest));
			this.log("[ SKIP ]", "Target buildling skipped:", "<" + this.target + ">");
			throw new errors.NothingToDo();
		}
		return preqObj;
	}
}

exports.Context = Context;
